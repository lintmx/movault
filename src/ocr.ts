import { normalizeCode, validCode, type Quad } from './ocr-geometry'

type Manifest = { version: string; files: { name: string; sha256: string; size: number }[] }
type Recognition = { text: string; confidence: number }
export type Pixels = { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number }
export type OcrClient = ReturnType<typeof createOcrClient>

export function createOcrClient(onOffline: (ready: boolean) => void) {
  let worker: Worker | undefined
  let ready: Promise<void> | undefined
  let generation = 0, sequence = 0
  const lifetime = new AbortController()
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: number }>()
  let manifestPromise: Promise<Manifest> | undefined
  let cachePromise: Promise<boolean> | undefined

  function cancel(reason: Error = new DOMException('common.cancelled', 'AbortError')) {
    generation++
    worker?.terminate()
    worker = undefined
    ready = undefined
    for (const job of pending.values()) { clearTimeout(job.timer); job.reject(reason) }
    pending.clear()
  }

  function request<T>(action: string, payload?: unknown, transfer: Transferable[] = [], timeout = 20000) {
    return new Promise<T>((resolve, reject) => {
      if (!worker) return reject(new DOMException('common.cancelled', 'AbortError'))
      const id = ++sequence
      const timer = window.setTimeout(() => cancel(new Error('ocr.timeout')), timeout)
      pending.set(id, { resolve: (value) => resolve(value as T), reject, timer })
      worker.postMessage({ id, action, payload }, transfer)
    })
  }

  async function resources() {
    if (!manifestPromise) {
      manifestPromise = fetch(`${import.meta.env.BASE_URL}ocr/manifest.json`, {
        signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(15000)]),
      }).then(async (response) => {
        if (!response.ok) throw new Error()
        return response.json() as Promise<Manifest>
      }).catch(() => { manifestPromise = undefined; throw new Error('ocr.resourcesFailed') })
    }
    return manifestPromise
  }

  async function cacheResources(manifest: Manifest) {
    try {
      const cache = await caches.open(`movault-ocr-${manifest.version}`)
      const files = [...manifest.files]
      await Promise.all(Array.from({ length: 3 }, async () => {
        for (let file = files.pop(); file; file = files.pop()) {
          const url = new URL(`${import.meta.env.BASE_URL}ocr/${manifest.version}/${file.name}`, location.href).href
          if (await cache.match(url)) continue
          const response = await fetch(url, { signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(60000)]) })
          if (!response.ok) throw new Error()
          const bytes = await response.clone().arrayBuffer()
          const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (n) => n.toString(16).padStart(2, '0')).join('')
          if (bytes.byteLength !== file.size || hash !== file.sha256) throw new Error()
          await cache.put(url, response)
        }
      }))
      if (!lifetime.signal.aborted) return true
    } catch { /* Online recognition can continue without persistent cache. */ }
    return false
  }

  function initialize() {
    if (!ready) {
      const current = generation
      ready = (async () => {
        const manifest = await resources()
        if (generation !== current || lifetime.signal.aborted) throw new DOMException('common.cancelled', 'AbortError')
        worker = new Worker(new URL(`${import.meta.env.BASE_URL}ocr/${manifest.version}/engine.js`, location.href))
        worker.onmessage = ({ data }) => {
          const job = pending.get(data.id)
          if (!job) return
          pending.delete(data.id)
          clearTimeout(job.timer)
          if (data.error) job.reject(new Error(data.error))
          else job.resolve(data.result)
        }
        worker.onerror = () => cancel(new Error('ocr.engineFailed'))
        const caching = cachePromise ??= cacheResources(manifest)
        await request('init', undefined, [], 60000)
        void caching.then((cached) => {
          if (!cached) cachePromise = undefined
          if (generation !== current || lifetime.signal.aborted) return
          const controlled = !!navigator.serviceWorker?.controller
          onOffline(cached && controlled)
          if (cached && controlled) navigator.serviceWorker.controller?.postMessage({ type: 'ocr-ready', version: manifest.version })
          if (cached && !controlled && 'serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('controllerchange', () => {
              if (!lifetime.signal.aborted && generation === current) onOffline(!!navigator.serviceWorker.controller)
            }, { once: true, signal: lifetime.signal })
          }
        })
      })().catch((error: Error) => {
        if (generation === current) cancel(error)
        throw error
      })
    }
    return ready
  }

  return {
    initialize, cancel,
    dispose() { lifetime.abort(); cancel() },
    async detect(pixels: ImageData) {
      await initialize()
      return request<Quad | null>('detect', pixels, [pixels.data.buffer])
    },
    async warp(pixels: ImageData, points: Quad, width: number, height: number) {
      await initialize()
      return request<Pixels>('warp', { pixels, points, width, height }, [pixels.data.buffer])
    },
    async recognize(blob: Blob) {
      await initialize()
      return request<Recognition>('recognize', blob)
    },
  }
}

export function canvas(width: number, height: number) {
  const result = document.createElement('canvas')
  result.width = width; result.height = height
  return result
}

export function toBlob(source: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => source.toBlob((blob) => blob ? resolve(blob) : reject(new Error('ocr.imageFailed')), 'image/png'))
}

export async function recognizeField(client: OcrClient, source: HTMLCanvasElement, length: number, isCurrent: () => boolean) {
  const input = canvas(source.width + 24, source.height + 24)
  const ctx = input.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, input.width, input.height)
  ctx.drawImage(source, 12, 12)
  async function recognize() {
    const blob = await toBlob(input)
    if (!isCurrent()) throw new DOMException('common.cancelled', 'AbortError')
    const result = await client.recognize(blob)
    if (!isCurrent()) throw new DOMException('common.cancelled', 'AbortError')
    return result
  }
  try {
    const first = await recognize()
    const value = normalizeCode(first.text)
    if (validCode(value, length) && first.confidence >= 85) return { value, issue: '' }
    const pixels = ctx.getImageData(0, 0, input.width, input.height)
    for (let i = 0; i < pixels.data.length; i += 4) {
      const gray = .299 * pixels.data[i] + .587 * pixels.data[i + 1] + .114 * pixels.data[i + 2]
      const color = gray > 145 ? 255 : 0
      pixels.data[i] = color; pixels.data[i + 1] = color; pixels.data[i + 2] = color
    }
    ctx.putImageData(pixels, 0, 0)
    const second = normalizeCode((await recognize()).text)
    if (validCode(value, length) && validCode(second, length) && value !== second) return { value: '', issue: 'ocr.inconsistent' }
    const selected = validCode(second, length) ? second : validCode(value, length) ? value : ''
    return { value: selected, issue: selected ? '' : 'ocr.unrecognized' }
  } finally { input.width = 0; input.height = 0 }
}

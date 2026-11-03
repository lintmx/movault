import { normalizeCode, validCode, type Quad } from './ocr-geometry'

type Manifest = { version: string; files: { name: string; path: string; sha256: string; size: number }[] }
type Recognition = { text: string; confidence: number }
export type Pixels = { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number }
export type OcrClient = ReturnType<typeof createOcrClient>

export function createOcrClient(onOffline: (ready: boolean) => void, onProgress: (percent: number | null) => void = () => {}) {
  let worker: Worker | undefined
  let ready: Promise<void> | undefined
  let generation = 0, sequence = 0
  const lifetime = new AbortController()
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: number }>()
  let loading: AbortController | undefined
  const urls: string[] = []

  function cancel(reason: Error = new DOMException('common.cancelled', 'AbortError')) {
    generation++
    loading?.abort(reason)
    loading = undefined
    worker?.terminate()
    worker = undefined
    ready = undefined
    for (const job of pending.values()) { clearTimeout(job.timer); job.reject(reason) }
    pending.clear()
    urls.splice(0).forEach(URL.revokeObjectURL)
    onProgress(null)
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

  async function resources(signal: AbortSignal) {
    const response = await fetch(`${import.meta.env.BASE_URL}ocr/manifest.json`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    })
    if (!response.ok) throw new Error('ocr.resourcesFailed')
    return response.json() as Promise<Manifest>
  }

  async function loadResources(manifest: Manifest, signal: AbortSignal) {
    const relaxed = WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,15,1,13,0,65,1,253,15,65,2,253,15,253,128,2,11]))
    const simd = WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11]))
    const core = `tesseract-core-${relaxed ? 'relaxedsimd-' : simd ? 'simd-' : ''}lstm.wasm.js`
    const names = ['engine.js', 'opencv.js', 'tesseract.min.js', 'worker.min.js', core, 'eng.traineddata']
    const files = names.map((name) => {
      const file = manifest.files.find((entry) => entry.name === name)
      if (!file?.path) throw new Error('ocr.resourcesFailed')
      return file
    })
    let cache: Cache | undefined
    try { cache = await caches.open(`movault-ocr-${manifest.version}`) } catch { /* Recognition also works without persistent storage. */ }
    let cached = !!cache
    const loaded = new Map<string, number>(), data = new Map<string, ArrayBuffer>()
    const total = files.reduce((sum, file) => sum + file.size, 0)
    function progress(name: string, size: number) {
      loaded.set(name, size)
      if (!signal.aborted) onProgress(Math.min(99, Math.floor([...loaded.values()].reduce((a, b) => a + b, 0) / total * 100)))
    }
    await Promise.all(Array.from({ length: 3 }, async () => {
      for (let file = files.shift(); file; file = files.shift()) {
        const url = new URL(`${import.meta.env.BASE_URL}ocr/${file.path}`, location.href).href
        for (let attempt = 0; attempt < 2; attempt++) {
          signal.throwIfAborted()
          const stalled = new AbortController()
          let timer = window.setTimeout(() => stalled.abort(), 15000)
          try {
            let response: Response | undefined
            if (!attempt) try { response = await caches.match(url) } catch { /* Storage may be unavailable. */ }
            response ??= await fetch(url, { cache: attempt ? 'reload' : 'default', signal: AbortSignal.any([signal, stalled.signal]) })
            if (!response.ok || !response.body) throw new Error('ocr.resourcesFailed')
            const reader = response.body.getReader(), chunks: Uint8Array[] = []
            let size = 0
            for (;;) {
              const chunk = await reader.read()
              if (chunk.done) break
              clearTimeout(timer)
              timer = window.setTimeout(() => stalled.abort(), 15000)
              chunks.push(chunk.value); size += chunk.value.length; progress(file.name, size)
            }
            const bytes = new Uint8Array(size)
            let offset = 0
            for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
            const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (n) => n.toString(16).padStart(2, '0')).join('')
            if (size !== file.size || hash !== file.sha256) {
              for (const key of await caches.keys()) {
                if (key.startsWith('movault-ocr-')) await (await caches.open(key)).delete(url)
              }
              throw new Error('ocr.resourcesFailed')
            }
            signal.throwIfAborted()
            data.set(file.name, bytes.buffer)
            if (cache) try { await cache.put(url, new Response(bytes)) } catch { cached = false }
            break
          } catch (error) {
            if (signal.aborted) throw signal.reason
            if (attempt) throw error
            progress(file.name, 0)
          } finally { clearTimeout(timer) }
        }
      }
    }))
    return { data, core, cached }
  }

  function script(parts: BlobPart[]) {
    const url = URL.createObjectURL(new Blob(parts, { type: 'text/javascript' }))
    urls.push(url)
    return url
  }

  function initialize() {
    if (!ready) {
      const current = generation
      const controller = new AbortController()
      loading = controller
      const { signal } = controller
      onProgress(0)
      const timeout = window.setTimeout(() => controller.abort(new Error('ocr.resourcesFailed')), 120000)
      const aborted = new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
      ready = Promise.race([aborted, (async () => {
        const manifest = await resources(signal)
        const { data, core, cached } = await loadResources(manifest, signal)
        signal.throwIfAborted()
        if (lifetime.signal.aborted) throw new DOMException('common.cancelled', 'AbortError')
        onProgress(100)
        worker = new Worker(script([data.get('engine.js')!]))
        worker.onmessage = ({ data }) => {
          const job = pending.get(data.id)
          if (!job) return
          pending.delete(data.id)
          clearTimeout(job.timer)
          if (data.error) job.reject(new Error(data.error))
          else job.resolve(data.result)
        }
        worker.onerror = () => cancel(new Error('ocr.engineFailed'))
        const workerPath = script([`importScripts(${JSON.stringify(script([data.get(core)!]))}, ${JSON.stringify(script([data.get('worker.min.js')!]))})`])
        const language = manifest.files.find((file) => file.name === 'eng.traineddata')!
        const langPath = new URL(`${import.meta.env.BASE_URL}ocr/${language.path.slice(0, language.path.lastIndexOf('/'))}`, location.href).href
        await request('init', { scripts: ['opencv.js', 'tesseract.min.js'].map((name) => script([data.get(name)!])), workerPath, langPath }, [], 30000)
        if (generation === current && !lifetime.signal.aborted) {
          const controlled = !!navigator.serviceWorker?.controller
          onOffline(cached && controlled)
          if (cached && controlled) navigator.serviceWorker.controller?.postMessage({ type: 'ocr-ready', version: manifest.version })
          if (cached && !controlled && 'serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('controllerchange', () => {
              if (!lifetime.signal.aborted && generation === current) onOffline(!!navigator.serviceWorker.controller)
            }, { once: true, signal: lifetime.signal })
          }
        }
      })()]).catch((error: Error) => {
        const reason = signal.aborted && error.name === 'AbortError' ? error : new Error('ocr.resourcesFailed')
        if (generation === current) cancel(reason)
        throw reason
      }).finally(() => {
        clearTimeout(timeout)
        if (generation === current) { loading = undefined; onProgress(null) }
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
    async prepare(pixels: ImageData, blockSize: number, green = false) {
      await initialize()
      return request<Pixels>('prepare', { pixels, blockSize, green }, [pixels.data.buffer])
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
  async function recognize(image: HTMLCanvasElement) {
    const blob = await toBlob(image)
    if (!isCurrent()) throw new DOMException('common.cancelled', 'AbortError')
    const result = await client.recognize(blob)
    if (!isCurrent()) throw new DOMException('common.cancelled', 'AbortError')
    return result
  }
  try {
    const results = [await recognize(source)]
    for (const blockSize of length === 4 ? [0, 31, 51] : [0, 31]) {
      input.width = source.width; input.height = source.height
      ctx.drawImage(source, 0, 0)
      const prepared = await client.prepare(ctx.getImageData(0, 0, input.width, input.height), blockSize, length === 4 && !blockSize)
      if (!isCurrent()) throw new DOMException('common.cancelled', 'AbortError')
      if (blockSize) {
        input.width += 24; input.height += 24
        ctx.fillStyle = 'white'; ctx.fillRect(0, 0, input.width, input.height)
      }
      ctx.putImageData(new ImageData(prepared.data, prepared.width, prepared.height), blockSize ? 12 : 0, blockSize ? 12 : 0)
      const result = await recognize(input)
      const value = normalizeCode(result.text)
      if (validCode(value, length) && results.some((previous) => normalizeCode(previous.text) === value) &&
        !results.some((previous) => previous.confidence >= 85 && validCode(normalizeCode(previous.text), length) && normalizeCode(previous.text) !== value)) return { value, issue: '' }
      results.push(result)
    }
    const valid = results.filter((result) => validCode(normalizeCode(result.text), length))
    if (new Set(valid.map((result) => normalizeCode(result.text))).size > 1) return { value: '', issue: 'ocr.inconsistent' }
    const selected = valid.find((result) => result.confidence >= 85)
    return { value: selected ? normalizeCode(selected.text) : '', issue: selected ? '' : 'ocr.unrecognized' }
  } finally { input.width = 0; input.height = 0 }
}

import { type Message, translateMessage } from './i18n'
import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type PointerEvent } from 'react'
import { Camera, FileImage, RotateCw } from 'lucide-react'
import { Field, Sheet } from './ui'
import { canvas, createOcrClient, recognizeField, toBlob, type OcrClient } from './ocr'
import { normalizeCode, rectangle, regionQuad, regions, validCode, validQuad, type Point, type Quad } from './ocr-geometry'

const initialCorners: Quad = [{ x: .08, y: .1 }, { x: .92, y: .1 }, { x: .92, y: .9 }, { x: .08, y: .9 }]
const labels = ['tickets.number', 'tickets.pin']

function NumberComparison({ source, value, length, id, label, disabled, invalid, enlarged, onChange, onLoad, onError, onZoom }: {
  source: string; value: string; length: number; id: string; label: string
  disabled: boolean; invalid: boolean; enlarged?: boolean
  onChange: (value: string) => void; onLoad?: () => void; onError: () => void; onZoom?: () => void
}) {
  const { t } = useTranslation()
  const [alignment, setAlignment] = useState<{ source: string; start: number; step: number } | null>(null)
  const aligned = alignment?.source === source ? alignment : null
  const start = aligned?.start ?? .5 / length, step = aligned?.step ?? 1 / length

  function imageLoaded(image: HTMLImageElement) {
    const sample = canvas(image.naturalWidth, image.naturalHeight)
    const ctx = sample.getContext('2d', { willReadFrequently: true })!
    try {
      ctx.drawImage(image, 0, 0)
      const { data } = ctx.getImageData(0, 0, sample.width, sample.height)
      const runs: { left: number; right: number }[] = []
      for (let x = 0; x < sample.width; x++) {
        let dark = 0
        for (let y = Math.floor(sample.height * .1); y < sample.height * .9; y++) {
          const i = (y * sample.width + x) * 4
          if (.299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2] < 105) dark++
        }
        if (dark < sample.height * .04) continue
        const last = runs.at(-1)
        if (last && x - last.right <= 3) last.right = x
        else runs.push({ left: x, right: x })
      }
      if (runs.length === length) {
        const centers = runs.map(({ left, right }) => (left + right) / 2 / sample.width)
        const pitch = (centers.at(-1)! - centers[0]) / (length - 1)
        if (centers.every((center, i) => Math.abs(center - centers[0] - i * pitch) < pitch * .2)) {
          setAlignment({ source, start: centers[0], step: pitch })
        }
      }
    } finally { sample.width = 0; sample.height = 0 }
    onLoad?.()
  }

  return <div className={`ocr-comparison-scroll${enlarged ? ' enlarged' : ''}`}>
    <div className="ocr-comparison" data-aligned={!!aligned} style={{ '--digit-start': `${start * 100}cqw`, '--digit-step': `${step * 100}cqw`, '--comparison-width': `${length * 56}px` } as CSSProperties}>
      <button type="button" className="ocr-preview" onClick={onZoom} disabled={!onZoom} aria-label={t('ocr.zoomSource', { value1: label })}>
        <img src={source} alt={t('ocr.sourceRegion', { value1: label })} onLoad={(event) => imageLoaded(event.currentTarget)} onError={onError} />
      </button>
      <input className="ocr-code" id={id} aria-label={label} type="text" inputMode="numeric" autoComplete="off" spellCheck={false}
        value={value} disabled={disabled} aria-invalid={invalid} aria-describedby={invalid && !enlarged ? `${id}-error` : undefined}
        onChange={(event) => onChange(normalizeCode(event.target.value))} />
      {aligned && <div className="ocr-digit-guides" aria-hidden="true">{Array.from({ length: length - 1 }, (_, i) =>
        <span key={i} style={{ left: `${(start + (i + .5) * step) * 100}%` }} />
      )}</div>}
    </div>
  </div>
}

function RegionEditor({ photo, corners, onCorners, boxes, onBoxes, direct, setDirect, onConfirm }: {
  photo: string; corners: Quad; onCorners: (quad: Quad) => void
  boxes: (Quad | null)[]; onBoxes: (boxes: (Quad | null)[]) => void
  direct: boolean; setDirect: (direct: boolean) => void; onConfirm: () => void
}) {
  const { t } = useTranslation()
  const area = useRef<HTMLDivElement>(null)
  const drag = useRef<{ corner?: number; start?: Point } | null>(null)
  const [selected, setSelected] = useState(0)
  const [magnifier, setMagnifier] = useState<Point | null>(null)
  function point(event: PointerEvent) {
    const rect = area.current!.getBoundingClientRect()
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) }
  }
  function move(event: PointerEvent) {
    if (!drag.current) return
    const p = point(event)
    setMagnifier(p)
    if (drag.current.corner !== undefined) {
      onCorners(corners.map((old, index) => index === drag.current!.corner ? p : old) as Quad)
    } else if (drag.current.start) {
      onBoxes(boxes.map((old, index) => index === selected ? rectangle(drag.current!.start!, p) : old))
    }
  }
  const overlay = direct ? boxes : validQuad(corners) ? regions.map((rect) => regionQuad(corners, rect)) : []
  return (
    <div className="ocr-editor">
      <div className="ocr-toolbar">
        <button type="button" className="text-button primary-text" onClick={() => setDirect(!direct)}>
          {direct ? t('ocr.adjustCorners') : t('ocr.selectNumbers')}
        </button>
        {!direct && <button type="button" className="text-button" onClick={() => onCorners([corners[3], corners[0], corners[1], corners[2]])}>
          <RotateCw size={16} />{t('ocr.rotate')}</button>}
      </div>
      <p className="hint">{direct ? t('ocr.selectHelp') : t('ocr.cornerHelp')}</p>
      {direct && <div className="segmented">{labels.map((label, index) => <button key={label} type="button" className={selected === index ? 'selected' : ''} onClick={() => setSelected(index)}>{t(label)}</button>)}</div>}
      <div className="ocr-crop-area" ref={area}
        onPointerDown={(event) => { if (direct) { drag.current = { start: point(event) }; event.currentTarget.setPointerCapture(event.pointerId) } }}
        onPointerMove={move} onPointerUp={() => { drag.current = null; setMagnifier(null) }} onPointerCancel={() => { drag.current = null; setMagnifier(null) }}>
        <img src={photo} alt={t('ocr.adjustImage')} draggable={false} />
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
          {!direct && <polygon className="ocr-outline" points={corners.map((p) => `${p.x * 1000},${p.y * 1000}`).join(' ')} />}
          {overlay.map((quad, index) => quad && <polygon key={index} className={`ocr-region ocr-region-${index}`} points={quad.map((p) => `${p.x * 1000},${p.y * 1000}`).join(' ')} />)}
        </svg>
        {overlay.map((quad, index) => quad && <span key={index} className={`ocr-region-label ocr-region-label-${index}`} style={{ left: `${quad[0].x * 100}%`, top: `${quad[0].y * 100}%` }}>{t(labels[index])}</span>)}
        {magnifier && <div className="ocr-magnifier" aria-hidden="true" style={{ backgroundImage: `url(${photo})`, backgroundPosition: `${magnifier.x * 100}% ${magnifier.y * 100}%`, left: magnifier.x > .5 ? 0 : 'auto', right: magnifier.x > .5 ? 'auto' : 0 }} />}
        {!direct && corners.map((p, index) => <button key={index} type="button" className="ocr-corner" aria-label={t(['ocr.topLeft', 'ocr.topRight', 'ocr.bottomRight', 'ocr.bottomLeft'][index])}
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          onPointerDown={(event) => { event.stopPropagation(); drag.current = { corner: index }; event.currentTarget.setPointerCapture(event.pointerId) }}
          onKeyDown={(event) => {
            const direction = { ArrowLeft: [-.005, 0], ArrowRight: [.005, 0], ArrowUp: [0, -.005], ArrowDown: [0, .005] }[event.key]
            if (!direction) return
            event.preventDefault()
            onCorners(corners.map((old, i) => i === index ? { x: Math.max(0, Math.min(1, old.x + direction[0])), y: Math.max(0, Math.min(1, old.y + direction[1])) } : old) as Quad)
          }}><span>{index + 1}</span></button>)}
      </div>
      <button type="button" className="button secondary" disabled={direct ? !boxes.every((q) => q && validQuad(q)) : !validQuad(corners)} onClick={onConfirm}>{t('ocr.useRegions')}</button>
    </div>
  )
}

export function OcrScanner({ number, pin, onNumber, onPin, onReady, resetToken, disabled, errors }: {
  number: string; pin: string; onNumber: (value: string) => void; onPin: (value: string) => void
  onReady: (ready: boolean) => void; resetToken: number; disabled: boolean; errors: Record<string, Message>
}) {
  const { t } = useTranslation()
  const [stage, setStage] = useState<'idle' | 'locating' | 'adjusting' | 'recognizing' | 'reviewing'>('idle')
  const [photo, setPhoto] = useState('')
  const [crops, setCrops] = useState<string[]>([])
  const [loaded, setLoaded] = useState([false, false])
  const [corners, setCorners] = useState<Quad>(initialCorners)
  const [boxes, setBoxes] = useState<(Quad | null)[]>([null, null])
  const [direct, setDirect] = useState(false)
  const [message, setMessage] = useState('')
  const [issues, setIssues] = useState(['', ''])
  const [offline, setOffline] = useState(false)
  const [preparing, setPreparing] = useState(true)
  const [zoom, setZoom] = useState<number | null>(null)
  const camera = useRef<HTMLInputElement>(null), album = useRef<HTMLInputElement>(null)
  const source = useRef<ImageBitmap | null>(null)
  const urls = useRef<string[]>([])
  const sequence = useRef(0)
  const client = useRef<OcrClient | null>(null)
  const busy = stage === 'locating' || stage === 'recognizing'

  function clearImages() {
    source.current?.close(); source.current = null
    urls.current.forEach(URL.revokeObjectURL); urls.current = []
  }

  useEffect(() => {
    const engine = createOcrClient(setOffline)
    client.current = engine
    let active = true
    void engine.initialize().catch(() => {
      if (active && !source.current) setMessage('ocr.resourcesPending')
    }).finally(() => { if (active) setPreparing(false) })
    function dispose() { active = false; sequence.current++; engine.dispose(); clearImages() }
    return dispose
  }, [])

  useEffect(() => {
    sequence.current++
    clearImages()
    setPhoto(''); setCrops([]); setLoaded([false, false]); setStage('idle')
    setMessage(''); setIssues(['', '']); setBoxes([null, null]); setZoom(null)
  }, [resetToken])

  useEffect(() => {
    onReady(stage === 'reviewing' && crops.length === 2 && loaded.every(Boolean))
    return () => onReady(false)
  }, [stage, crops, loaded, onReady])

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const task = ++sequence.current
    if (busy) client.current?.cancel()
    clearImages()
    onReady(false); onNumber(''); onPin('')
    setPhoto(''); setCrops([]); setLoaded([false, false]); setIssues(['', '']); setBoxes([null, null]); setZoom(null)
    setStage('locating'); setMessage('ocr.locating')
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 25 * 1048576) throw new Error('ocr.invalidFile')
      const image = await createImageBitmap(file, { imageOrientation: 'from-image' })
      if (task !== sequence.current) { image.close(); return }
      if (image.width * image.height > 24000000) { image.close(); throw new Error('ocr.imageTooLarge') }
      source.current = image
      const ratio = Math.min(1, 960 / Math.max(image.width, image.height))
      const preview = canvas(Math.round(image.width * ratio), Math.round(image.height * ratio))
      const ctx = preview.getContext('2d')!
      ctx.drawImage(image, 0, 0, preview.width, preview.height)
      const blob = await toBlob(preview)
      if (task !== sequence.current) return
      const url = URL.createObjectURL(blob); urls.current.push(url); setPhoto(url)
      setCorners(initialCorners)
      try {
        const detected = await client.current!.detect(ctx.getImageData(0, 0, preview.width, preview.height))
        if (task !== sequence.current) return
        if (detected && validQuad(detected)) {
          setCorners(detected); setDirect(false)
          await processRegions(detected, false, task)
        } else { setDirect(false); setStage('adjusting'); setMessage('ocr.checkCorners') }
      } catch {
        if (task === sequence.current) { setDirect(true); setStage('adjusting'); setMessage('ocr.locationFailed') }
      } finally { preview.width = 0; preview.height = 0 }
    } catch (error) {
      if (task === sequence.current) { setStage('idle'); setMessage((error as Error).message) }
    }
  }

  async function extract(quad: Quad, index: number, directCrop: boolean, task: number) {
    const image = source.current!
    const points = quad.map((p) => ({ x: p.x * image.width, y: p.y * image.height })) as Quad
    const left = Math.max(0, Math.floor(Math.min(...points.map((p) => p.x))))
    const top = Math.max(0, Math.floor(Math.min(...points.map((p) => p.y))))
    const width = Math.min(image.width - left, Math.ceil(Math.max(...points.map((p) => p.x))) - left)
    const height = Math.min(image.height - top, Math.ceil(Math.max(...points.map((p) => p.y))) - top)
    const edge = (a: number, b: number) => Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y)
    const lowResolution = Math.min(edge(1, 2), edge(0, 3)) < 24 || Math.min(edge(0, 1), edge(3, 2)) / (index === 0 ? 10 : 4) < 10
    const scale = Math.min(1, 1600 / Math.max(width, height))
    const input = canvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)))
    const ctx = input.getContext('2d')!
    ctx.drawImage(image, left, top, width, height, 0, 0, input.width, input.height)
    if (directCrop) return { image: input, lowResolution }
    try {
      const result = await client.current!.warp(ctx.getImageData(0, 0, input.width, input.height),
        points.map((p) => ({ x: (p.x - left) * scale, y: (p.y - top) * scale })) as Quad, index === 0 ? 636 : 312, index === 0 ? 105 : 112)
      if (task !== sequence.current) throw new DOMException('common.cancelled', 'AbortError')
      const output = canvas(result.width, result.height)
      output.getContext('2d')!.putImageData(new ImageData(result.data, result.width, result.height), 0, 0)
      return { image: output, lowResolution }
    } finally { input.width = 0; input.height = 0 }
  }

  async function processRegions(quad: Quad, directCrop: boolean, task = ++sequence.current) {
    onReady(false); onNumber(''); onPin('')
    setStage('recognizing'); setMessage('ocr.recognizing'); setIssues(['', '']); setLoaded([false, false]); setCrops([])
    const images: { image: HTMLCanvasElement; lowResolution: boolean }[] = []
    try {
      for (let i = 0; i < 2; i++) {
        const extracted = await extract(directCrop ? boxes[i]! : regionQuad(quad, regions[i]), i, directCrop, task)
        images.push(extracted)
        if (task !== sequence.current) return
      }
      const blobs = await Promise.all(images.map(({ image }) => toBlob(image)))
      if (task !== sequence.current) return
      const nextUrls = blobs.map((blob) => URL.createObjectURL(blob))
      urls.current.slice(1).forEach(URL.revokeObjectURL)
      urls.current = [urls.current[0], ...nextUrls]
      setCrops(nextUrls)
      for (let i = 0; i < 2; i++) {
        let value = '', issue = ''
        if (images[i].lowResolution) issue = 'ocr.lowResolution'
        else {
          try { ({ value, issue } = await recognizeField(client.current!, images[i].image, i === 0 ? 10 : 4, () => task === sequence.current)) }
          catch { issue = 'ocr.incomplete' }
        }
        if (task !== sequence.current) return
        ;(i === 0 ? onNumber : onPin)(value)
        setIssues((old) => old.map((text, index) => index === i ? issue : text))
      }
      setStage('reviewing'); setMessage('ocr.reviewHelp')
    } catch (error) {
      if (task === sequence.current) { setStage('adjusting'); setDirect(true); setMessage((error as Error).message) }
    } finally { images.forEach(({ image }) => { image.width = 0; image.height = 0 }) }
  }

  function cancel() {
    sequence.current++; client.current?.cancel(); setPreparing(false)
    setStage(crops.length === 2 ? 'reviewing' : photo ? 'adjusting' : 'idle')
    setMessage('ocr.stopped')
  }

  function editNumber(index: number, value: string) {
    ;(index === 0 ? onNumber : onPin)(value)
    setIssues((old) => old.map((v, i) => i === index ? '' : v))
  }

  function imageError(index: number) {
    setLoaded((old) => old.map((v, i) => i === index ? false : v))
    setMessage('ocr.imageUnavailable')
  }

  return <fieldset className="ocr-scanner" disabled={disabled}>
    <legend className="sr-only">{t('ocr.title')}</legend>
    <div className="photo-actions">
      <button className="button secondary" type="button" onClick={() => camera.current?.click()}><Camera size={20} />{photo ? t('ocr.retake') : t('ocr.scan')}</button>
      <button className="button secondary" type="button" onClick={() => album.current?.click()}><FileImage size={20} />{t('ocr.choosePhoto')}</button>
    </div>
    <input ref={camera} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={pick} />
    <input ref={album} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} />
    <p className="hint" role="status">{preparing ? t('ocr.preparing') : offline ? t('ocr.offlineReady') : t('ocr.offlinePending')}</p>
    {message && <p className="notice" role="status">{translateMessage(message)}</p>}
    {(busy || preparing) && <button type="button" className="text-button" onClick={cancel}>{t('ocr.stop')}</button>}
    {stage === 'idle' && <p className="hint">{t('ocr.photoHelp')}</p>}
    {stage === 'adjusting' && photo && <RegionEditor photo={photo} corners={corners} onCorners={setCorners} boxes={boxes} onBoxes={setBoxes} direct={direct} setDirect={setDirect} onConfirm={() => void processRegions(corners, direct)} />}
    {(stage === 'reviewing' || stage === 'recognizing') && crops.length === 2 && labels.map((label, index) => {
      const value = index === 0 ? number : pin, length = index === 0 ? 10 : 4
      const invalid = !validCode(value, length) && (!!value || !!errors[index === 0 ? 'number' : 'pin'])
      return <Field key={label} id={`ocr-${index}`} label={t(label)} hint={t('tickets.digitProgress', { value1: value.length, value2: length })} error={invalid ? index === 0 ? 'tickets.numberInvalid' : 'tickets.pinInvalid' : undefined}>
        <NumberComparison source={crops[index]} value={value} length={length} id={`ocr-${index}`} label={t(label)}
          disabled={busy || disabled} invalid={invalid} onChange={(value) => editNumber(index, value)} onZoom={() => setZoom(index)}
          onLoad={() => setLoaded((old) => old.map((v, i) => i === index ? true : v))} onError={() => imageError(index)} />
        {issues[index] && <p className="hint">{translateMessage(issues[index])}</p>}
      </Field>
    })}
    {stage === 'reviewing' && <div className="ocr-toolbar">
      <button type="button" className="text-button primary-text" onClick={() => { onReady(false); sequence.current++; setStage('adjusting') }}>{t('ocr.adjustRegions')}</button>
      <button type="button" className="text-button" onClick={() => void processRegions(corners, direct)}>{t('ocr.retry')}</button>
    </div>}
    {zoom !== null && crops[zoom] && <Sheet title={t('ocr.zoomTitle', { value1: t(labels[zoom]) })} description={t('ocr.zoomHelp')} onClose={() => setZoom(null)}>
      <NumberComparison enlarged source={crops[zoom]} value={zoom === 0 ? number : pin} length={zoom === 0 ? 10 : 4}
        id={`ocr-zoom-${zoom}`} label={t(labels[zoom])} disabled={busy || disabled} invalid={!validCode(zoom === 0 ? number : pin, zoom === 0 ? 10 : 4)}
        onChange={(value) => editNumber(zoom, value)} onError={() => imageError(zoom)} />
    </Sheet>}
  </fieldset>
}

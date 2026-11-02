/* global importScripts, cv, Tesseract */
let vision
let recognizer

async function initialize() {
  importScripts('./opencv.js', './tesseract.min.js')
  await new Promise((resolve, reject) => cv.then((module) => { vision = module; resolve() }, reject))
  recognizer = await Tesseract.createWorker('eng', 1, {
    workerPath: new URL('./worker.min.js', self.location.href).href,
    corePath: new URL('./', self.location.href).href,
    langPath: new URL('./', self.location.href).href.replace(/\/$/, ''),
    cacheMethod: 'none',
    gzip: false,
    workerBlobURL: false,
    logger: () => {},
    errorHandler: () => {},
  })
  await recognizer.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '0123456789' })
  return true
}

function order(points) {
  const center = points.reduce((sum, p) => ({ x: sum.x + p.x / 4, y: sum.y + p.y / 4 }), { x: 0, y: 0 })
  points.sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x))
  const first = points.reduce((index, p, i) => p.x + p.y < points[index].x + points[index].y ? i : index, 0)
  return [...points.slice(first), ...points.slice(0, first)]
}

function refineCorners(contour, points) {
  const c = vision, lines = []
  for (let side = 0; side < 4; side++) {
    const a = points[side], b = points[(side + 1) % 4]
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy)
    const samples = []
    for (let i = 0; i < contour.rows; i++) {
      const next = (i + 1) % contour.rows
      const x = contour.data32S[i * 2], y = contour.data32S[i * 2 + 1]
      const ex = contour.data32S[next * 2] - x, ey = contour.data32S[next * 2 + 1] - y
      for (const f of [.25, .5, .75]) {
        const px = x + ex * f, py = y + ey * f
        const t = ((px - a.x) * dx + (py - a.y) * dy) / (length * length)
        const distance = Math.abs((px - a.x) * dy - (py - a.y) * dx) / length
        if (t > .15 && t < .85 && distance < length * .035) samples.push(px, py)
      }
    }
    if (samples.length < 6) return points
    const input = c.matFromArray(samples.length / 2, 1, c.CV_32FC2, samples), line = new c.Mat()
    try { c.fitLine(input, line, c.DIST_L2, 0, .01, .01); lines.push(Array.from(line.data32F)) }
    finally { input.delete(); line.delete() }
  }
  return points.map((point, i) => {
    const [ax, ay, x, y] = lines[(i + 3) % 4], [bx, by, u, v] = lines[i]
    const det = ax * by - ay * bx
    if (Math.abs(det) < .1) return point
    const t = ((u - x) * by - (v - y) * bx) / det
    return { x: x + t * ax, y: y + t * ay }
  })
}

function detect(pixels) {
  const c = vision
  const src = c.matFromImageData(pixels), gray = new c.Mat(), mask = new c.Mat()
  const contours = new c.MatVector(), hierarchy = new c.Mat()
  try {
    c.cvtColor(src, gray, c.COLOR_RGBA2GRAY)
    c.GaussianBlur(gray, gray, new c.Size(5, 5), 0)
    c.threshold(gray, mask, 0, 255, c.THRESH_BINARY + c.THRESH_OTSU)
    c.findContours(mask, contours, hierarchy, c.RETR_EXTERNAL, c.CHAIN_APPROX_SIMPLE)
    const candidates = []
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i), approx = new c.Mat()
      try {
        const area = c.contourArea(contour) / (src.cols * src.rows)
        if (area < .15 || area > .98) continue
        c.approxPolyDP(contour, approx, .025 * c.arcLength(contour, true), true)
        if (approx.rows !== 4 || !c.isContourConvex(approx)) continue
        let points = refineCorners(contour, order(Array.from({ length: 4 }, (_, j) => ({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] }))))
        const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
        if (distance(points[0], points[1]) < distance(points[1], points[2])) points = [...points.slice(1), points[0]]
        const ratio = (distance(points[0], points[1]) + distance(points[2], points[3])) /
          (distance(points[1], points[2]) + distance(points[3], points[0]))
        if (ratio < 1.2 || ratio > 2.15) continue
        candidates.push({ points, area })
      } finally { contour.delete(); approx.delete() }
    }
    candidates.sort((a, b) => b.area - a.area)
    if (!candidates.length || (candidates[1] && candidates[1].area > candidates[0].area * .65)) return null
    const points = candidates[0].points
    const input = c.matFromArray(4, 1, c.CV_32FC2, points.flatMap((p) => [p.x, p.y]))
    const output = c.matFromArray(4, 1, c.CV_32FC2, [0, 0, 479, 0, 479, 299, 0, 299])
    const transform = c.getPerspectiveTransform(input, output), card = new c.Mat()
    try {
      c.warpPerspective(gray, card, transform, new c.Size(480, 300))
      const stripeScore = (top, bottom) => {
        let count = 0
        for (let y = top; y < bottom; y++) for (let x = 25; x < 365; x++) {
          if ((card.ucharAt(y, x) < 100) !== (card.ucharAt(y, x + 1) < 100)) count++
        }
        return count
      }
      const lower = stripeScore(204, 238), upper = stripeScore(62, 96)
      if (Math.max(lower, upper) < 300 || Math.max(lower, upper) < Math.min(lower, upper) * 1.4) return null
      const upright = lower > upper ? points : [points[2], points[3], points[0], points[1]]
      return upright.map((p) => ({ x: p.x / src.cols, y: p.y / src.rows }))
    } finally { input.delete(); output.delete(); transform.delete(); card.delete() }
  } finally { src.delete(); gray.delete(); mask.delete(); contours.delete(); hierarchy.delete() }
}

function warp({ pixels, points, width, height }) {
  const c = vision, src = c.matFromImageData(pixels), dst = new c.Mat()
  const input = c.matFromArray(4, 1, c.CV_32FC2, points.flatMap((p) => [p.x, p.y]))
  const output = c.matFromArray(4, 1, c.CV_32FC2, [0, 0, width - 1, 0, width - 1, height - 1, 0, height - 1])
  const transform = c.getPerspectiveTransform(input, output)
  try {
    c.warpPerspective(src, dst, transform, new c.Size(width, height), c.INTER_LINEAR, c.BORDER_CONSTANT, new c.Scalar(255, 255, 255, 255))
    return { data: new Uint8ClampedArray(dst.data), width, height }
  } finally { src.delete(); dst.delete(); input.delete(); output.delete(); transform.delete() }
}

self.onmessage = async ({ data: { id, action, payload } }) => {
  try {
    let result
    if (action === 'init') result = await initialize()
    else if (action === 'detect') result = detect(payload)
    else if (action === 'warp') result = warp(payload)
    else if (action === 'recognize') {
      const { data } = await recognizer.recognize(payload)
      result = { text: data.text, confidence: data.confidence }
    } else throw new Error('Unknown action')
    self.postMessage({ id, result }, result?.data ? [result.data.buffer] : [])
  } catch {
    self.postMessage({ id, error: '识别处理失败，请重试或对照图片填写。' })
  }
}

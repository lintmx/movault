export type Point = { x: number; y: number }
export type Quad = [Point, Point, Point, Point]
export type Rect = { x: number; y: number; width: number; height: number }
export const regions: [Rect, Rect] = [
  { x: .515, y: .355, width: .265, height: .070 },
  { x: .810, y: .040, width: .130, height: .075 },
]

export function normalizeCode(value: string) {
  return value.replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10))
    .replace(/\s/g, '')
}

export function validCode(value: string, length: number) {
  return new RegExp(`^[0-9]{${length}}$`).test(value)
}

export function validQuad(points: Quad) {
  const crosses = points.map((p, i) => {
    const q = points[(i + 1) % 4], r = points[(i + 2) % 4]
    return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x)
  })
  return points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) &&
    p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1) && crosses.every((n) => n > .0001)
}

export function project(quad: Quad, u: number, v: number): Point {
  const [p, q, r, s] = quad
  const dx1 = q.x - r.x, dx2 = s.x - r.x, dx3 = p.x - q.x + r.x - s.x
  const dy1 = q.y - r.y, dy2 = s.y - r.y, dy3 = p.y - q.y + r.y - s.y
  const det = dx1 * dy2 - dx2 * dy1
  const g = (dx3 * dy2 - dx2 * dy3) / det
  const h = (dx1 * dy3 - dx3 * dy1) / det
  const d = g * u + h * v + 1
  return {
    x: ((q.x - p.x + g * q.x) * u + (s.x - p.x + h * s.x) * v + p.x) / d,
    y: ((q.y - p.y + g * q.y) * u + (s.y - p.y + h * s.y) * v + p.y) / d,
  }
}

export function regionQuad(quad: Quad, rect: Rect): Quad {
  return [project(quad, rect.x, rect.y), project(quad, rect.x + rect.width, rect.y),
    project(quad, rect.x + rect.width, rect.y + rect.height), project(quad, rect.x, rect.y + rect.height)]
}

export function rectangle(a: Point, b: Point): Quad {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
  const right = Math.max(a.x, b.x), bottom = Math.max(a.y, b.y)
  return [{ x, y }, { x: right, y }, { x: right, y: bottom }, { x, y: bottom }]
}

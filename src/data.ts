export type Status = 'available' | 'pending' | 'used'
export type TicketType = 'physical' | 'digital'
export type Ticket = {
  id: string
  movieId: string
  type: TicketType
  number: string
  pin: string
  counts: Record<Status, number>
  price: number
  note: string
  createdAt: string
  updatedAt: string
}
export type Movie = {
  id: string
  title: string
  releaseDate: string
  price: number
  poster: string
  createdAt: string
  updatedAt: string
}
export type Library = { movies: Movie[]; tickets: Ticket[] }

export const storageKey = 'movault-library-v1'
export const schemaVersion = 1
export const timestamp = () => new Date().toISOString()
export const statuses: Status[] = ['available', 'pending', 'used']
export const statusLabels: Record<Status, string> = {
  available: '未使用',
  pending: '待确认',
  used: '已使用',
}
export const typeLabels: Record<TicketType, string> = {
  physical: '实体券',
  digital: '电子券',
}
export const credentialKey = (movieId: string, number: string, pin: string) =>
  JSON.stringify([movieId, number, pin])
export const navigate = (path: string) => {
  if (window.location.pathname === path) return
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
export const yen = (amount: number) =>
  `¥${Math.round(amount).toLocaleString('ja-JP')}`
export const formatNumber = (number: string) =>
  number.replace(/^(\d{4})(\d{4})(\d{2})$/, '$1 $2 $3')
export const formatDate = (date: string) =>
  date
    ? `${Number(date.slice(0, 4))}年${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`
    : '上映日期未设置'

export function totals(tickets: Ticket[]) {
  const counts = {
    available: 0,
    pending: 0,
    used: 0,
    total: 0,
    price: 0,
    amounts: { available: 0, pending: 0, used: 0 },
  }
  for (const ticket of tickets) {
    for (const status of statuses) counts[status] += ticket.counts[status]
    const price = Math.round(ticket.price)
    const total = statuses.reduce((sum, status) => sum + ticket.counts[status], 0)
    let remainder = price
    const shares = statuses.map((status) => {
      const share = (price * ticket.counts[status]) / total
      const amount = Math.floor(share)
      counts.amounts[status] += amount
      remainder -= amount
      return { status, fraction: share - amount }
    })
    shares.sort((a, b) => b.fraction - a.fraction)
    for (const { status } of shares) {
      if (remainder <= 0) break
      counts.amounts[status]++
      remainder--
    }
    counts.price += price
  }
  counts.total = counts.available + counts.pending + counts.used
  return counts
}

function timestamps(record: { createdAt?: string; updatedAt?: string }, now: string) {
  const createdAt = record.createdAt ?? record.updatedAt ?? now
  const updatedAt = record.updatedAt ?? createdAt
  if (
    typeof createdAt !== 'string' || typeof updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(createdAt)) || !Number.isFinite(Date.parse(updatedAt))
  ) throw new Error('创建时间或更新时间无效，请检查备份文件。')
  return {
    createdAt: new Date(createdAt).toISOString(),
    updatedAt: new Date(updatedAt).toISOString(),
  }
}

export function parseLibrary(text: string): Library {
  const data = JSON.parse(text) as Library & { version?: number }
  if (!data || !Array.isArray(data.movies) || !Array.isArray(data.tickets))
    throw new Error('文件格式不正确，请选择 Movault 导出的 JSON 备份。')
  if (data.version !== undefined && data.version !== schemaVersion)
    throw new Error('不支持此备份的数据版本，请使用兼容版本的 Movault。')
  const now = timestamp()
  const movieIds = new Set<string>()
  for (const movie of data.movies) {
    if (
      !movie ||
      typeof movie.id !== 'string' ||
      !movie.id ||
      movieIds.has(movie.id) ||
      typeof movie.title !== 'string' ||
      !movie.title.trim() ||
      typeof movie.releaseDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(movie.releaseDate) ||
      !Number.isFinite(movie.price) ||
      movie.price < 0 ||
      typeof movie.poster !== 'string' ||
      (movie.poster &&
        !/^(data:image\/(jpeg|png|webp);base64,|\/posters\/)/.test(
          movie.poster,
        ))
    )
      throw new Error('电影资料不完整或重复，请检查备份文件。')
    movieIds.add(movie.id)
  }
  const ticketIds = new Set<string>()
  for (const ticket of data.tickets) {
    if (
      !ticket ||
      typeof ticket.id !== 'string' ||
      !ticket.id ||
      ticketIds.has(ticket.id) ||
      !movieIds.has(ticket.movieId) ||
      !['physical', 'digital'].includes(ticket.type) ||
      typeof ticket.number !== 'string' ||
      !/^\d{10}$/.test(ticket.number) ||
      typeof ticket.pin !== 'string' ||
      !/^\d{4}$/.test(ticket.pin) ||
      !ticket.counts ||
      statuses.some(
        (status) =>
          !Number.isSafeInteger(ticket.counts[status]) ||
          ticket.counts[status] < 0,
      ) ||
      !Number.isFinite(ticket.price) ||
      ticket.price < 0 ||
      typeof ticket.note !== 'string'
    )
      throw new Error('前售券资料不完整、标识重复或兑换次数无效。')
    const count = statuses.reduce(
      (sum, status) => sum + ticket.counts[status],
      0,
    )
    if (
      !Number.isSafeInteger(count) ||
      count < 1 ||
      (ticket.type === 'physical' && count !== 1)
    )
      throw new Error('前售券的兑换总次数不正确。')
    ticketIds.add(ticket.id)
  }
  return {
    movies: data.movies.map((movie) => ({ ...movie, ...timestamps(movie, now) })),
    tickets: data.tickets.map((ticket) => ({ ...ticket, ...timestamps(ticket, now) })),
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('movault', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('library')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveLibrary(library: Library) {
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('library', 'readwrite')
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
      transaction.objectStore('library').put({ version: schemaVersion, ...library }, 'current')
    })
  } finally {
    database.close()
  }
}

export async function readLibrary() {
  let data: Library = { movies: [], tickets: [] }
  try {
    const database = await openDatabase()
    let stored: Library | undefined
    try {
      stored = await new Promise<Library | undefined>((resolve, reject) => {
        const request = database
          .transaction('library', 'readonly')
          .objectStore('library')
          .get('current')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    } finally {
      database.close()
    }
    if (stored !== undefined) {
      data = parseLibrary(JSON.stringify(stored))
      if (JSON.stringify(stored) !== JSON.stringify({ version: schemaVersion, ...data }))
        await saveLibrary(data)
      return { data, error: '' }
    }
    const saved = localStorage.getItem(storageKey)
    data = saved ? parseLibrary(saved) : { movies: [], tickets: [] }
    if (saved) await saveLibrary(data)
    return { data, error: '' }
  } catch {
    return {
      data,
      error: '本地数据无法读取或迁移，尚未删除原数据。请重试或从备份恢复。',
    }
  }
}

export function readImage(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      return reject(new Error('请选择 JPG、PNG 或 WebP 图片。'))
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('图片读取失败，请重新选择。'))
    reader.readAsDataURL(file)
  })
}

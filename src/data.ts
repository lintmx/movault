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

export const schemaVersion = 1
const backupReminderInterval = 3 * 24 * 60 * 60 * 1000
export const timestamp = () => new Date().toISOString()
export const statuses: Status[] = ['available', 'pending', 'used']
export const statusLabels: Record<Status, string> = {
  available: 'tickets.statusAvailable',
  pending: 'tickets.statusPending',
  used: 'tickets.statusUsed',
}
export const typeLabels: Record<TicketType, string> = {
  physical: 'tickets.typePhysical',
  digital: 'tickets.typeDigital',
}
export const credentialKey = (movieId: string, number: string, pin: string) =>
  JSON.stringify([movieId, number, pin])
export const navigate = (path: string) => {
  if (window.location.pathname === path) return
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
export const formatNumber = (number: string) =>
  number.replace(/^(\d{4})(\d{4})(\d{2})$/, '$1 $2 $3')
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
  ) throw new Error('errors.backupTimestamps')
  return {
    createdAt: new Date(createdAt).toISOString(),
    updatedAt: new Date(updatedAt).toISOString(),
  }
}

export function parseLibrary(text: string): Library {
  const data = JSON.parse(text) as Library & { version?: number }
  if (!data || !Array.isArray(data.movies) || !Array.isArray(data.tickets))
    throw new Error('errors.backupFormat')
  if (data.version !== undefined && data.version !== schemaVersion)
    throw new Error('errors.backupVersion')
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
      throw new Error('errors.backupMovies')
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
      throw new Error('errors.backupTickets')
    const count = statuses.reduce(
      (sum, status) => sum + ticket.counts[status],
      0,
    )
    if (
      !Number.isSafeInteger(count) ||
      count < 1 ||
      (ticket.type === 'physical' && count !== 1)
    )
      throw new Error('errors.backupCounts')
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

export async function saveLibrary(library: Library, previous?: Library) {
  const database = await openDatabase()
  try {
    return await new Promise<string | false>((resolve, reject) => {
      const transaction = database.transaction('library', 'readwrite')
      let revision = crypto.randomUUID()
      let conflict = false
      transaction.oncomplete = () => resolve(revision)
      transaction.onabort = () => conflict ? resolve(false) : reject(transaction.error)
      const store = transaction.objectStore('library')
      const request = store.get('current')
      request.onsuccess = () => {
        if (previous) {
          try {
            const current = request.result === undefined
              ? { movies: [], tickets: [] }
              : parseLibrary(JSON.stringify(request.result))
            conflict = JSON.stringify(current) !== JSON.stringify(previous)
          } catch {
            conflict = true
          }
          if (conflict) {
            transaction.abort()
            return
          }
          if (JSON.stringify(library) === JSON.stringify(previous)) {
            const revisionRequest = store.get('revision')
            revisionRequest.onsuccess = () => { revision = revisionRequest.result ?? '' }
            return
          }
        }
        store.put({ version: schemaVersion, ...library }, 'current')
        store.put(revision, 'revision')
        const reminderRequest = store.get('backupReminderAt')
        reminderRequest.onsuccess = () => {
          if (reminderRequest.result === undefined)
            store.put(Date.now() + backupReminderInterval, 'backupReminderAt')
        }
      }
    })
  } finally {
    database.close()
  }
}

export async function readLibrary() {
  let data: Library = { movies: [], tickets: [] }
  let revision = ''
  let exportedRevision: string | null = null
  let noticeSeen = false
  try {
    const database = await openDatabase()
    let stored: Library | undefined
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('library', 'readonly')
        const store = transaction.objectStore('library')
        const libraryRequest = store.get('current')
        libraryRequest.onsuccess = () => { stored = libraryRequest.result }
        const revisionRequest = store.get('revision')
        revisionRequest.onsuccess = () => { revision = revisionRequest.result ?? '' }
        const exportRequest = store.get('exportedRevision')
        exportRequest.onsuccess = () => { exportedRevision = exportRequest.result ?? null }
        const noticeRequest = store.get('noticeSeen')
        noticeRequest.onsuccess = () => { noticeSeen = noticeRequest.result === true }
        transaction.oncomplete = () => resolve()
        transaction.onabort = () => reject(transaction.error)
      })
    } finally {
      database.close()
    }
    if (stored !== undefined) {
      data = parseLibrary(JSON.stringify(stored))
    }
    return { data, revision, exportedRevision, noticeSeen, error: '' }
  } catch {
    return {
      data,
      revision,
      exportedRevision,
      noticeSeen,
      error: 'errors.loadStorage',
    }
  }
}

export async function saveSafetyPreference(key: 'noticeSeen' | 'exportedRevision', value: true | string) {
  const database = await openDatabase()
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const transaction = database.transaction('library', 'readwrite')
      const store = transaction.objectStore('library')
      let saved = true
      if (key === 'exportedRevision') {
        const request = store.get('revision')
        request.onsuccess = () => {
          saved = (request.result ?? '') === value
          if (saved) {
            store.put(value, key)
            store.delete('backupReminderAt')
          }
        }
      } else store.put(value, key)
      transaction.oncomplete = () => resolve(saved)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

export async function claimBackupReminder() {
  const database = await openDatabase()
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const transaction = database.transaction('library', 'readwrite')
      const store = transaction.objectStore('library')
      let revision = ''
      let exportedRevision: string | null = null
      let library: Library | undefined
      let remind = false
      const revisionRequest = store.get('revision')
      revisionRequest.onsuccess = () => { revision = revisionRequest.result ?? '' }
      const exportRequest = store.get('exportedRevision')
      exportRequest.onsuccess = () => { exportedRevision = exportRequest.result ?? null }
      const libraryRequest = store.get('current')
      libraryRequest.onsuccess = () => { library = libraryRequest.result }
      const reminderRequest = store.get('backupReminderAt')
      reminderRequest.onsuccess = () => {
        if (exportedRevision === revision || !(revision || library?.movies.length || library?.tickets.length)) return
        const now = Date.now()
        if (reminderRequest.result === undefined) {
          store.put(now + backupReminderInterval, 'backupReminderAt')
        } else if (now >= reminderRequest.result) {
          remind = true
          store.put(now + backupReminderInterval, 'backupReminderAt')
        }
      }
      transaction.oncomplete = () => resolve(remind)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

export function readImage(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      return reject(new Error('errors.imageFormat'))
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('errors.imageRead'))
    reader.readAsDataURL(file)
  })
}

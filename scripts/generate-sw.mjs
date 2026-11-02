import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const output = new URL('../dist/', import.meta.url)
async function files(directory) {
  const paths = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) paths.push(...await files(path))
    else if (entry.name !== 'sw.js') paths.push(path)
  }
  return paths.sort()
}

const root = fileURLToPath(output)
const paths = await files(root)
const assets = paths.map((path) => `./${relative(root, path).split('\\').join('/')}`)
const hash = createHash('sha256').update(await readFile(new URL(import.meta.url)))
for (const path of paths) hash.update(path.slice(root.length)).update(await readFile(path))
const version = hash.digest('hex').slice(0, 16)

await writeFile(new URL('sw.js', output), `
const CACHE = 'movault-shell-${version}'
const ASSETS = new Set(${JSON.stringify(assets)}.map(path => new URL(path, self.registration.scope).href))
const INDEX = new URL('./index.html', self.registration.scope).href

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll([...ASSETS].map(url => new Request(url, { cache: 'reload' })))
  ))
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('movault-shell-') && key !== CACHE) await caches.delete(key)
    }
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  const key = event.request.mode === 'navigate' ? INDEX : url.href
  if (!ASSETS.has(key)) return
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    return await cache.match(key) || fetch(event.request)
  })())
})
`)
console.log(`Offline cache: ${assets.length} assets (${version})`)

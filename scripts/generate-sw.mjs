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
    else if (entry.name !== 'sw.js' && entry.name !== 'version.json') paths.push(path)
  }
  return paths.sort()
}

const root = fileURLToPath(output)
const paths = (await files(root)).filter(path => !relative(root, path).replaceAll('\\', '/').match(/^ocr\/[a-f0-9]{16}\//))
const assets = paths.map((path) => `./${relative(root, path).split('\\').join('/')}`)
const hash = createHash('sha256').update(await readFile(new URL(import.meta.url)))
for (const path of paths) hash.update(path.slice(root.length)).update(await readFile(path))
const version = hash.digest('hex').slice(0, 16)
const appVersion = JSON.parse(await readFile(new URL('version.json', output), 'utf8'))

await writeFile(new URL('sw.js', output), `
const CACHE = 'movault-shell-${version}'
const BUILD_ID = ${JSON.stringify(appVersion.id)}
const ASSETS = new Set(${JSON.stringify(assets)}.map(path => new URL(path, self.registration.scope).href))
const INDEX = new URL('./index.html', self.registration.scope).href
const VERSION_PATH = new URL('./version.json', self.registration.scope).pathname
const OCR_ROOT = new URL('./ocr/', self.registration.scope).href

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
  if (url.pathname === VERSION_PATH) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }))
    return
  }
  if (url.href.startsWith(OCR_ROOT)) {
    const resource = url.href.slice(OCR_ROOT.length)
    const version = resource.match(new RegExp('^([a-f0-9]{16})/'))?.[1]
    if (version) {
      event.respondWith((async () => {
        try {
          const cached = event.request.cache === 'reload' ? undefined : await caches.match(event.request)
          if (cached) return cached
        } catch {}
        return fetch(event.request)
      })())
      return
    }
  }
  const key = event.request.mode === 'navigate' ? INDEX : url.href
  if (!ASSETS.has(key)) return
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    return await cache.match(key) || fetch(event.request)
  })())
})

self.addEventListener('message', event => {
  if (event.data?.type === 'activate-update') {
    event.waitUntil((async () => {
      const reply = (error, errorKey) => event.ports[0]?.postMessage({ error, errorKey })
      if (event.data.buildId !== BUILD_ID) return reply('新版本资源尚未就绪，请稍后重试。', 'updates.notReady')
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (clients.length !== 1 || clients[0].id !== event.source?.id) {
        return reply('请先保存并关闭本站的其他标签页或应用窗口，再点击立即更新。', 'updates.closeOtherWindows')
      }
      await self.skipWaiting()
      reply('')
    })())
    return
  }
  if (event.data?.type !== 'ocr-ready' || !/^[a-f0-9]{16}$/.test(event.data.version)) return
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (clients.length !== 1 || clients[0].id !== event.source?.id) return
    for (const key of await caches.keys()) {
      if (key.startsWith('movault-ocr-') && key !== 'movault-ocr-' + event.data.version) await caches.delete(key)
    }
  })())
})
`)
console.log(`Offline cache: ${assets.length} assets (${version})`)

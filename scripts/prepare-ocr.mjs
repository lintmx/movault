import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const tess = dirname(require.resolve('tesseract.js/package.json'))
const core = dirname(createRequire(join(tess, 'package.json')).resolve('tesseract.js-core/package.json'))
const cv = dirname(require.resolve('@techstark/opencv-js/package.json'))
const eng = dirname(require.resolve('@tesseract.js-data/eng/package.json'))
const sources = [
  ['engine.js', new URL('./ocr-engine.js', import.meta.url)],
  ['tesseract.min.js', join(tess, 'dist/tesseract.min.js')],
  ['worker.min.js', join(tess, 'dist/worker.min.js')],
  ['opencv.js', join(cv, 'dist/opencv.js')],
  ['eng.traineddata', join(eng, '4.0.0_best_int/eng.traineddata.gz')],
  ['LICENSE-tesseract', join(tess, 'LICENSE.md')],
  ['LICENSE-core', join(core, 'LICENSE')],
  ['LICENSE-opencv', join(cv, 'LICENSE')],
  ['tesseract.min.js.LICENSE.txt', join(tess, 'dist/tesseract.min.js.LICENSE.txt')],
  ['worker.min.js.LICENSE.txt', join(tess, 'dist/worker.min.js.LICENSE.txt')],
  ...((await readdir(core)).filter((name) => /-lstm\.wasm\.js$/.test(name)).map((name) => [name, join(core, name)])),
]
if (sources.filter(([name]) => name.endsWith('.wasm.js')).length !== 3) throw new Error('Missing OCR core variants')
const files = await Promise.all(sources.map(async ([name, path]) => {
  const data = await readFile(path)
  return { name, data, sha256: createHash('sha256').update(data).digest('hex') }
}))
const versions = await Promise.all([tess, core, cv, eng].map(async (path) => {
  const { name, version, license, repository } = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'))
  return { name, version, license, repository }
}))
const version = createHash('sha256').update(JSON.stringify(files.map(({ name, sha256 }) => [name, sha256]))).digest('hex').slice(0, 16)
const root = new URL('../public/ocr/', import.meta.url)
await mkdir(root, { recursive: true })
for (const name of await readdir(new URL('../public/ocr/', import.meta.url))) {
  if (/^[a-f0-9]{16}$/.test(name)) await rm(new URL(`${name}/`, root), { recursive: true })
}
await Promise.all(files.map(async ({ name, data, sha256 }) => {
  const directory = new URL(`${sha256.slice(0, 16)}/`, root)
  await mkdir(directory, { recursive: true })
  await writeFile(new URL(name, directory), data)
}))
await writeFile(new URL('../public/ocr/manifest.json', import.meta.url), JSON.stringify({
  version, versions, files: files.map(({ name, sha256, data }) => ({ name, path: `${sha256.slice(0, 16)}/${name}`, sha256, size: data.length })),
}, null, 2))
console.log(`OCR resources: ${version}, ${(files.reduce((sum, f) => sum + f.data.length, 0) / 1048576).toFixed(1)} MiB`)

import react from '@vitejs/plugin-react'
import { execFileSync } from 'node:child_process'
import { defineConfig } from 'vite'

const builtAt = new Date().toISOString()
const beijingTime = new Date(Date.parse(builtAt) + 8 * 60 * 60 * 1000).toISOString()
let commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? ''
if (!commit) {
  try {
    commit = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    commit = 'local'
  }
}
const version = {
  id: `${builtAt}-${commit}`,
  label: `${beijingTime.slice(0, 10).replaceAll('-', '.')}-${beijingTime.slice(11, 19).replaceAll(':', '')}`,
  commit,
  builtAt,
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react(), {
    name: 'app-version',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(version) })
    },
  }],
})

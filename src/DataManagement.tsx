import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  AlertTriangle,
  Check,
  Database,
  Download,
  FileJson,
  Info,
  Upload,
} from 'lucide-react'
import { credentialKey, navigate, parseLibrary, readImage, schemaVersion, totals, type Library } from './data'
import { Header, Sheet } from './ui'

export function DataManagement({
  library,
  save,
  notify,
}: {
  library: Library
  save: (library: Library) => Promise<boolean>
  notify: (message: string) => void
}) {
  const [file, setFile] = useState<{
    name: string
    size: number
    data: Library
  } | null>(null)
  const [strategy, setStrategy] = useState<'merge' | 'replace'>('merge')
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let active = true
    if ('serviceWorker' in navigator)
      void navigator.serviceWorker.ready.then(() => { if (active) setOfflineReady(true) })
    return () => { active = false }
  }, [])
  const knownIds = new Set(library.tickets.map((ticket) => ticket.id))
  const knownCredentials = new Set(library.tickets.map((ticket) =>
    credentialKey(ticket.movieId, ticket.number, ticket.pin)))
  let duplicateImports = 0
  for (const ticket of file?.data.tickets ?? []) {
    if (knownIds.has(ticket.id)) continue
    const key = credentialKey(ticket.movieId, ticket.number, ticket.pin)
    if (knownCredentials.has(key)) duplicateImports++
    knownCredentials.add(key)
  }
  async function exportData() {
    setExporting(true)
    try {
      const movies = await Promise.all(library.movies.map(async (movie) => {
        if (!movie.poster.startsWith('/posters/')) return movie
        const response = await fetch(movie.poster)
        if (!response.ok) throw new Error('海报读取失败，请联网重试或重新上传海报。')
        return { ...movie, poster: await readImage(await response.blob()) }
      }))
      const backup = { version: schemaVersion, exportedAt: new Date().toISOString(), movies, tickets: library.tickets }
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
      )
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `movault_backup_${new Date().toLocaleDateString('en-CA')}.json`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      notify('已生成 JSON 备份')
    } catch {
      notify('备份未导出：无法读取海报，请联网重试或重新上传海报。')
    } finally {
      setExporting(false)
    }
  }
  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]
    if (selected) {
      try {
        setFile({
          name: selected.name,
          size: selected.size,
          data: parseLibrary(await selected.text()),
        })
        setError('')
      } catch (reason) {
        setFile(null)
        setError(
          reason instanceof SyntaxError
            ? '无法读取 JSON，请选择有效的备份文件。'
            : (reason as Error).message,
        )
      }
    }
    event.target.value = ''
  }
  async function importData() {
    if (!file) return
    let next = file.data
    let skipped = 0
    let skippedMovies = 0
    if (strategy === 'merge') {
      const movieIds = new Set(library.movies.map((movie) => movie.id))
      const ticketIds = new Set(library.tickets.map((ticket) => ticket.id))
      const additions = file.data.tickets.filter((ticket) => {
        if (ticketIds.has(ticket.id)) {
          skipped++
          return false
        }
        return true
      })
      skippedMovies = file.data.movies.filter((movie) =>
        movieIds.has(movie.id),
      ).length
      next = {
        movies: [
          ...library.movies,
          ...file.data.movies.filter((movie) => !movieIds.has(movie.id)),
        ],
        tickets: [...library.tickets, ...additions],
      }
    }
    if (await save(next)) {
      setFile(null)
      setConfirm(false)
      notify(
        skipped || skippedMovies
          ? `已导入，保留 ${skippedMovies} 部本地电影和 ${skipped} 张本地前售券`
          : '备份已导入',
      )
    }
  }
  return (
    <>
      <Header title="数据管理" back={() => navigate('/')} />
      <main className="page data-page">
        <div className="notice">
          <Info size={16} />
          <span>数据仅保存在当前浏览器，请定期导出备份。</span>
        </div>
        <div className="local-summary">
          <div>
            <Database size={18} />
            <strong>本地存储</strong>
          </div>
          <span>
            {library.movies.length} 部电影，{library.tickets.length} 张券
            <br />共 {totals(library.tickets).total} 次兑换
          </span>
        </div>
        <section className="data-section">
          <h2>导出备份</h2>
          <p>保存全部电影、海报、凭证号码、兑换状态、价格与备注。</p>
          <button className="button secondary" onClick={exportData} disabled={exporting}>
            <Download size={18} />
            {exporting ? '正在导出…' : '导出 JSON'}
          </button>
        </section>
        <section className="data-section">
          <h2>导入备份</h2>
          <p>从此前导出的备份文件恢复或合并前售券信息。</p>
          <input
            hidden
            ref={picker}
            type="file"
            accept="application/json,.json"
            onChange={pickFile}
          />
          {file ? (
            <>
              <div className="import-file">
                <FileJson size={20} />
                <div>
                  <strong>{file.name}</strong>
                  <span>{Math.max(1, Math.round(file.size / 1024))} KB</span>
                </div>
                <button
                  className="text-button primary-text"
                  onClick={() => picker.current?.click()}
                >
                  更换文件
                </button>
              </div>
              <p className="import-summary">
                待导入：{file.data.movies.length} 部电影，
                {file.data.tickets.length} 张前售券
              </p>
            </>
          ) : (
            <button
              className="file-picker"
              onClick={() => picker.current?.click()}
            >
              <Upload size={24} />
              <span>选择备份文件</span>
              <span className="hint">JSON 格式</span>
            </button>
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          {file && (
            <>
              <fieldset className="import-strategies">
                <legend className="sr-only">导入处理方式</legend>
                <label
                  className={`import-option ${strategy === 'merge' ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="import-strategy"
                    checked={strategy === 'merge'}
                    onChange={() => setStrategy('merge')}
                  />
                  <div>
                    <strong>合并现有数据</strong>
                    <span>
                      按内部标识识别同一记录，冲突时保留本地版本；不同记录会合并加入，即使号码组合相同。
                    </span>
                  </div>
                  {strategy === 'merge' && <Check size={18} />}
                </label>
                <label
                  className={`import-option ${strategy === 'replace' ? 'replace-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="import-strategy"
                    checked={strategy === 'replace'}
                    onChange={() => setStrategy('replace')}
                  />
                  <div>
                    <strong>覆盖现有数据</strong>
                    <span>
                      删除当前 {library.movies.length} 部电影与{' '}
                      {library.tickets.length} 张券，替换为文件内容。
                    </span>
                  </div>
                  {strategy === 'replace' && <Check size={18} />}
                </label>
              </fieldset>
              {strategy === 'merge' && duplicateImports > 0 && (
                <div className="notice pending-text">
                  <AlertTriangle size={16} />
                  <span>有 {duplicateImports} 条号码组合疑似重复，但属于不同记录，将一并导入，请核对。</span>
                </div>
              )}
              {strategy === 'replace' && (
                <div className="notice danger-notice">
                  <AlertTriangle size={16} />
                  <span>覆盖后，当前未备份的数据无法恢复。</span>
                </div>
              )}
              <button
                className={`button full-width ${strategy === 'replace' ? 'danger' : 'primary'}`}
                onClick={() =>
                  strategy === 'replace' ? setConfirm(true) : importData()
                }
              >
                {strategy === 'replace' ? '覆盖导入' : '确认导入'}
              </button>
              <button
                className="text-button full-width"
                onClick={() => {
                  setFile(null)
                  setError('')
                }}
              >
                取消
              </button>
            </>
          )}
        </section>
        <p className="hint" role="status">
          {offlineReady ? '离线资源已就绪，可断网查看和管理前售券。'
            : '首次联网加载并缓存资源后，可离线使用。'}
        </p>
      </main>
      {confirm && (
        <Sheet
          title="覆盖本地数据"
          description={`将用「${file?.name}」替换当前 ${library.movies.length} 部电影和 ${library.tickets.length} 张前售券。此操作无法撤销。`}
          onClose={() => setConfirm(false)}
        >
          <div className="sheet-footer">
            <button
              className="button secondary"
              onClick={() => setConfirm(false)}
            >
              取消
            </button>
            <button className="button danger" onClick={importData}>
              确认覆盖导入
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}

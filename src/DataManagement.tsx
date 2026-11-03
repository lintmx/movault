import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  AlertTriangle,
  Check,
  Database,
  Download,
  FileJson,
  Info,
  RefreshCw,
  Upload,
} from 'lucide-react'
import { credentialKey, navigate, parseLibrary, readImage, schemaVersion, totals, type Library } from './data'
import { Header, Sheet } from './ui'
import { applyUpdate, currentVersion, type useAppVersion } from './version'

export function DataManagement({
  library,
  save,
  notify,
  needsBackup,
  onExported,
  onExportingChange,
  onShowSafety,
  appVersion,
}: {
  library: Library
  save: (library: Library, replace?: boolean) => Promise<boolean>
  notify: (message: string) => void
  needsBackup: boolean
  onExported: () => Promise<boolean>
  onExportingChange: (value: boolean) => void
  onShowSafety: () => void
  appVersion: ReturnType<typeof useAppVersion>
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
  const exportLock = useRef(false)
  const [prepared, setPrepared] = useState<{ source: Library; movies: Library['movies'] } | null>(null)
  const [prepareError, setPrepareError] = useState(false)
  const [prepareAttempt, setPrepareAttempt] = useState(0)
  const [shareFailed, setShareFailed] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)
  const [importing, setImporting] = useState(false)
  const [picking, setPicking] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState('')
  const updateController = useRef<AbortController | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  useEffect(() => () => updateController.current?.abort(), [])
  async function updateApp() {
    if (updating || file || importing || picking || exporting) return
    const controller = new AbortController()
    updateController.current = controller
    setUpdating(true)
    setUpdateError('')
    try {
      await applyUpdate(controller.signal)
    } catch (reason) {
      if (!controller.signal.aborted) setUpdateError(
        reason instanceof TypeError || (reason as Error).name === 'TimeoutError'
          ? '更新失败，请检查网络后重试。' : (reason as Error).message,
      )
    } finally {
      if (!controller.signal.aborted) setUpdating(false)
    }
  }
  useEffect(() => {
    let active = true
    if ('serviceWorker' in navigator)
      void navigator.serviceWorker.ready.then(() => { if (active) setOfflineReady(true) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    let active = true
    void Promise.all(library.movies.map(async (movie) => {
      if (!movie.poster.startsWith('/posters/')) return movie
      const response = await fetch(movie.poster)
      if (!response.ok) throw new Error('海报读取失败')
      return { ...movie, poster: await readImage(await response.blob()) }
    })).then((movies) => {
      if (active) {
        setPrepared({ source: library, movies })
        setPrepareError(false)
        setShareFailed(false)
      }
    }).catch(() => {
      if (active) {
        setPrepared(null)
        setPrepareError(true)
      }
    })
    return () => { active = false }
  }, [library, prepareAttempt])
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
  async function exportData(downloadOnly = false) {
    if (exportLock.current || prepared?.source !== library) return
    exportLock.current = true
    setExporting(true)
    onExportingChange(true)
    setShareFailed(false)
    try {
      const now = new Date()
      const pad = (value: number) => String(value).padStart(2, '0')
      const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
      const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
      const random = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0')
      const backup = { version: schemaVersion, exportedAt: now.toISOString(), movies: prepared.movies, tickets: library.tickets }
      const backupFile = new File(
        [JSON.stringify(backup, null, 2)],
        `movault_backup_${date}_${time}_${random}.json`,
        { type: 'application/json' },
      )
      const shared = !downloadOnly && !!navigator.share && !!navigator.canShare?.({ files: [backupFile] })
      if (shared) {
        await navigator.share({ files: [backupFile], title: 'Movault 本地备份' })
      } else {
        const url = URL.createObjectURL(backupFile)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = backupFile.name
        document.body.append(anchor)
        anchor.click()
        anchor.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 60000)
      }
      try {
        const recorded = await onExported()
        notify(!recorded ? '本地数据已在其他页面更新，本次仅导出了旧版本，请刷新后重新导出。'
          : shared ? '备份已交给系统分享，请确认已保存到本机文件夹。' : '已发起备份下载，请确认文件已保存到本机。')
      } catch {
        notify('备份已发起，但无法记录导出状态，下次进入仍会提醒。请确认文件已保存。')
      }
    } catch (reason) {
      if (reason instanceof Error && reason.name === 'AbortError') {
        notify('已取消分享，仍会提醒备份。')
      } else {
        setShareFailed(true)
        notify('备份未导出，请重试或使用「直接下载」。')
      }
    } finally {
      exportLock.current = false
      setExporting(false)
      onExportingChange(false)
    }
  }
  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]
    if (selected) {
      setPicking(true)
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
      } finally {
        setPicking(false)
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
    setImporting(true)
    try {
      if (await save(next, strategy === 'replace')) {
        setFile(null)
        setConfirm(false)
        notify(
          skipped || skippedMovies
            ? `已导入，保留 ${skippedMovies} 部本地电影和 ${skipped} 张本地前售券`
            : '备份已导入',
        )
      }
    } finally {
      setImporting(false)
    }
  }
  return (
    <>
      <Header title="数据管理" back={() => { if (!updating) navigate('/') }} />
      <main className="page data-page">
        <fieldset disabled={updating}>
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
          <p>分享时选择「存储到文件」→「在我的 iPhone / iPad」，或 Android 本地文件夹；不支持文件分享时会下载，无需云盘。</p>
          <p className={needsBackup ? 'backup-pending' : 'hint'} role="status">
            {needsBackup ? '当前数据有尚未导出的变更。' : '当前没有待导出的变更。'}
            导出后请检查本机文件，浏览器无法确认最终保存位置。
          </p>
          {prepareError ? (
            <>
              <p className="field-error" role="alert">无法准备完整备份：请联网重试，或重新上传无法读取的海报。</p>
              <button className="button secondary" onClick={() => {
                setPrepareError(false)
                setPrepareAttempt((value) => value + 1)
              }}>重试准备备份</button>
            </>
          ) : (
            <button className="button secondary" onClick={() => exportData()}
              disabled={exporting || prepared?.source !== library}>
              <Download size={18} />
              {exporting ? '正在导出…' : prepared?.source !== library ? '正在准备备份…' : '导出 JSON'}
            </button>
          )}
          {shareFailed && <button className="text-button primary-text backup-download" disabled={exporting || prepared?.source !== library}
            onClick={() => exportData(true)}>直接下载</button>}
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
        <section className="data-section">
          <h2>数据保留与存储保护</h2>
          <p>查看当前平台的清理规则、添加主屏幕的方法，以及存储保护申请。</p>
          <button className="button secondary" onClick={onShowSafety}><Info size={18} />查看数据安全说明</button>
        </section>
        <section className="data-section version-section" aria-label="应用版本">
          <h2>应用版本</h2>
          <dl className="version-details">
            <div><dt>当前版本</dt><dd>{import.meta.env.DEV ? '开发版本' : currentVersion.label}</dd></div>
            <div><dt>代码版本</dt><dd>{currentVersion.commit}</dd></div>
            <div><dt>构建时间</dt><dd>{new Date(currentVersion.builtAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（北京时间）</dd></div>
            {appVersion.checkedAt && <div><dt>上次成功检查</dt><dd>{appVersion.checkedAt.toLocaleString('zh-CN', { hour12: false })}</dd></div>}
          </dl>
          <p role="status">
            {import.meta.env.DEV ? '开发环境不检查线上更新。'
              : updating ? '正在准备新版本，完成后将刷新页面…'
                : appVersion.status === 'checking' ? '正在检查更新…'
                  : appVersion.status === 'latest' ? '已是最新版本'
                    : appVersion.status === 'available' ? `发现新版本：${appVersion.latest?.label}`
                      : appVersion.status === 'error' ? '暂时无法确认最新版本，请联网后重试。' : '尚未检查更新'}
          </p>
          {updateError && <p className="field-error" role="alert">{updateError}</p>}
          <div className="version-actions">
            <button className="button secondary" disabled={import.meta.env.DEV || appVersion.status === 'checking'}
              onClick={() => { setUpdateError(''); void appVersion.check(true) }}>
              <RefreshCw size={18} />检查更新
            </button>
            {appVersion.status === 'available' && <button className="button primary" onClick={updateApp}
              disabled={!!file || exporting || importing || picking}>
              <Download size={18} />{updating ? '正在更新…' : '立即更新'}
            </button>}
          </div>
          {appVersion.status === 'available' && <p className="version-help">
            {file || picking ? '请先完成或取消备份导入，再更新应用。'
              : exporting || importing ? '请等待导入或导出完成后再更新。'
                : '更新后会刷新当前页面，已保存的票券数据会保留。'}
          </p>}
        </section>
        <p className="hint" role="status">
          {offlineReady ? '离线资源已就绪，可断网查看和管理前售券。'
            : '首次联网加载并缓存资源后，可离线使用。'}
        </p>
        </fieldset>
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

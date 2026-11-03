import { type Message, translateMessage, formatDateTime } from './i18n'
import { useTranslation } from 'react-i18next'
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
  notify: (message: Message) => void
  needsBackup: boolean
  onExported: () => Promise<boolean>
  onExportingChange: (value: boolean) => void
  onShowSafety: () => void
  appVersion: ReturnType<typeof useAppVersion>
}) {
  const { t } = useTranslation()
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
          ? 'updates.failed' : (reason as Error).message,
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
      if (!response.ok) throw new Error('errors.posterLoad')
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
        await navigator.share({ files: [backupFile], title: t('backup.shareTitle') })
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
        notify(!recorded ? 'backup.staleExport'
          : shared ? 'backup.shared' : 'backup.downloaded')
      } catch {
        notify('backup.exportRecordFailed')
      }
    } catch (reason) {
      if (reason instanceof Error && reason.name === 'AbortError') {
        notify('backup.shareCancelled')
      } else {
        setShareFailed(true)
        notify('backup.exportFailed')
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
            ? 'backup.invalidJson'
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
            ? { key: 'backup.merged', values: { value1: skippedMovies, value2: skipped } }
            : 'backup.imported',
        )
      }
    } finally {
      setImporting(false)
    }
  }
  return (
    <>
      <Header title={t('backup.title')} back={() => { if (!updating) navigate('/') }} />
      <main className="page data-page">
        <fieldset disabled={updating}>
        <div className="notice">
          <Info size={16} />
          <span>{t('backup.localNotice')}</span>
        </div>
        <div className="local-summary">
          <div>
            <Database size={18} />
            <strong>{t('backup.localStorage')}</strong>
          </div>
          <span>{t('backup.recordCounts', { value1: library.movies.length, value2: library.tickets.length })}<br />{t('backup.redemptions', { count: totals(library.tickets).total })}</span>
        </div>
        <section className="data-section">
          <h2>{t('backup.export')}</h2>
          <p>{t('backup.exportDescription')}</p>
          <p>{t('backup.shareHelp')}</p>
          <p className={needsBackup ? 'backup-pending' : 'hint'} role="status">{t('backup.verifyExport', { value1: needsBackup ? t('backup.pendingChanges') : t('backup.noChanges') })}</p>
          {prepareError ? (
            <>
              <p className="field-error" role="alert">{t('backup.prepareFailed')}</p>
              <button className="button secondary" onClick={() => {
                setPrepareError(false)
                setPrepareAttempt((value) => value + 1)
              }}>{t('backup.retryPrepare')}</button>
            </>
          ) : (
            <button className="button secondary" onClick={() => exportData()}
              disabled={exporting || prepared?.source !== library}>
              <Download size={18} />
              {exporting ? t('backup.exporting') : prepared?.source !== library ? t('backup.preparing') : t('backup.exportJson')}
            </button>
          )}
          {shareFailed && <button className="text-button primary-text backup-download" disabled={exporting || prepared?.source !== library}
            onClick={() => exportData(true)}>{t('backup.download')}</button>}
        </section>
        <section className="data-section">
          <h2>{t('backup.import')}</h2>
          <p>{t('backup.importDescription')}</p>
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
                >{t('backup.changeFile')}</button>
              </div>
              <p className="import-summary">{t('backup.importPreview', { value1: file.data.movies.length, value2: file.data.tickets.length })}</p>
            </>
          ) : (
            <button
              className="file-picker"
              onClick={() => picker.current?.click()}
            >
              <Upload size={24} />
              <span>{t('backup.chooseFile')}</span>
              <span className="hint">{t('backup.jsonFormat')}</span>
            </button>
          )}
          {error && (
            <p className="field-error" role="alert">
              {translateMessage(error)}
            </p>
          )}
          {file && (
            <>
              <fieldset className="import-strategies">
                <legend className="sr-only">{t('backup.strategy')}</legend>
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
                    <strong>{t('backup.merge')}</strong>
                    <span>{t('backup.mergeDescription')}</span>
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
                    <strong>{t('backup.replace')}</strong>
                    <span>{t('backup.replaceDescription', { value1: library.movies.length, value2: library.tickets.length })}</span>
                  </div>
                  {strategy === 'replace' && <Check size={18} />}
                </label>
              </fieldset>
              {strategy === 'merge' && duplicateImports > 0 && (
                <div className="notice pending-text">
                  <AlertTriangle size={16} />
                  <span>{t('backup.duplicates', { count: duplicateImports })}</span>
                </div>
              )}
              {strategy === 'replace' && (
                <div className="notice danger-notice">
                  <AlertTriangle size={16} />
                  <span>{t('backup.replaceWarning')}</span>
                </div>
              )}
              <button
                className={`button full-width ${strategy === 'replace' ? 'danger' : 'primary'}`}
                onClick={() =>
                  strategy === 'replace' ? setConfirm(true) : importData()
                }
              >
                {strategy === 'replace' ? t('backup.replaceImport') : t('backup.confirmImport')}
              </button>
              <button
                className="text-button full-width"
                onClick={() => {
                  setFile(null)
                  setError('')
                }}
              >{t('common.cancel')}</button>
            </>
          )}
        </section>
        <section className="data-section">
          <h2>{t('safety.sectionTitle')}</h2>
          <p>{t('safety.sectionDescription')}</p>
          <button className="button secondary" onClick={onShowSafety}><Info size={18} />{t('safety.show')}</button>
        </section>
        <section className="data-section version-section" aria-label={t('updates.title')}>
          <h2>{t('updates.title')}</h2>
          <dl className="version-details">
            <div><dt>{t('updates.current')}</dt><dd>{import.meta.env.DEV ? t('updates.development') : currentVersion.label}</dd></div>
            <div><dt>{t('updates.commit')}</dt><dd>{currentVersion.commit}</dd></div>
            <div><dt>{t('updates.builtAt')}</dt><dd>{t('updates.beijingTime', { value1: formatDateTime(new Date(currentVersion.builtAt), 'Asia/Shanghai') })}</dd></div>
            {appVersion.checkedAt && <div><dt>{t('updates.checkedAt')}</dt><dd>{formatDateTime(appVersion.checkedAt)}</dd></div>}
          </dl>
          <p role="status">
            {import.meta.env.DEV ? t('updates.devNotice')
              : updating ? t('updates.preparing')
                : appVersion.status === 'checking' ? t('updates.checking')
                  : appVersion.status === 'latest' ? t('updates.latest')
                    : appVersion.status === 'available' ? t('updates.available', { value1: appVersion.latest?.label })
                      : appVersion.status === 'error' ? t('updates.checkFailed') : t('updates.unchecked')}
          </p>
          {updateError && <p className="field-error" role="alert">{translateMessage(updateError)}</p>}
          <div className="version-actions">
            <button className="button secondary" disabled={import.meta.env.DEV || appVersion.status === 'checking'}
              onClick={() => { setUpdateError(''); void appVersion.check(true) }}>
              <RefreshCw size={18} />{t('updates.check')}</button>
            {appVersion.status === 'available' && <button className="button primary" onClick={updateApp}
              disabled={!!file || exporting || importing || picking}>
              <Download size={18} />{updating ? t('updates.updating') : t('updates.apply')}
            </button>}
          </div>
          {appVersion.status === 'available' && <p className="version-help">
            {file || picking ? t('updates.finishPicking')
              : exporting || importing ? t('updates.waitForTransfer')
                : t('updates.reloadNotice')}
          </p>}
        </section>
        <p className="hint" role="status">
          {offlineReady ? t('common.offlineReady')
            : t('common.offlinePending')}
        </p>
        </fieldset>
      </main>
      {confirm && (
        <Sheet
          title={t('backup.replaceTitle')}
          description={t('backup.replaceConfirm', { value1: file?.name, value2: library.movies.length, value3: library.tickets.length })}
          onClose={() => setConfirm(false)}
        >
          <div className="sheet-footer">
            <button
              className="button secondary"
              onClick={() => setConfirm(false)}
            >{t('common.cancel')}</button>
            <button className="button danger" onClick={importData}>{t('backup.confirmReplace')}</button>
          </div>
        </Sheet>
      )}
    </>
  )
}

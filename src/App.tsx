import { type Message, translateMessage, formatDate } from './i18n'
import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ChartNoAxesColumn, ChevronRight, Plus, X } from 'lucide-react'
import {
  navigate,
  readLibrary,
  saveLibrary,
  saveSafetyPreference,
  claimBackupReminder,
  totals,
  type Library,
} from './data'
import {
  Badge,
  DataButton,
  EmptyState,
  Header,
  Poster,
  Progress,
  StatusLegend,
  Statistics,
  Field,
  Sheet,
} from './ui'
import { MovieDetail } from './MovieDetail'
import { MovieForm, TicketForm } from './forms'
import { DataManagement } from './DataManagement'
import { DataSafety } from './DataSafety'
import { currentVersion, useAppVersion } from './version'
import './styles.css'

function App() {
  const { t } = useTranslation()
  const appVersion = useAppVersion()
  const [library, setLibrary] = useState<Library | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState('')
  const [exportedRevision, setExportedRevision] = useState<string | null>(null)
  const [safetyOpen, setSafetyOpen] = useState(false)
  const [backupReminder, setBackupReminder] = useState(false)
  const exporting = useRef(false)
  const saving = useRef(false)
  const [route, setRoute] = useState(() => window.location.pathname)
  const [toast, setToast] = useState<Message>('')
  const [movieIndex, setMovieIndex] = useState(0)
  const [statisticsMovieId, setStatisticsMovieId] = useState('all')

  useEffect(() => {
    let active = true
    void readLibrary().then((result) => {
      if (active) {
        setLibrary(result.data)
        setError(result.error)
        setRevision(result.revision)
        setExportedRevision(result.exportedRevision)
        setSafetyOpen(!result.error && !result.noticeSeen)
      }
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!library || error || safetyOpen || backupReminder || route === '/data') return
    let active = true
    async function remind() {
      if (document.visibilityState !== 'visible' || exporting.current) return
      const due = await claimBackupReminder().catch(() => false)
      if (active && due) setBackupReminder(true)
    }
    function restore(event: PageTransitionEvent) {
      if (event.persisted) void remind()
    }
    document.addEventListener('visibilitychange', remind)
    window.addEventListener('pageshow', restore)
    void remind()
    const timer = window.setInterval(() => void remind(), 60000)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', remind)
      window.removeEventListener('pageshow', restore)
      window.clearInterval(timer)
    }
  }, [route, library, error, safetyOpen, backupReminder])

  useEffect(() => {
    function change() {
      setRoute(window.location.pathname)
      window.scrollTo(0, 0)
    }
    window.addEventListener('popstate', change)
    return () => window.removeEventListener('popstate', change)
  }, [])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3000)
    return () => window.clearTimeout(timer)
  }, [toast])

  async function save(next: Library, replace = false) {
    if (saving.current || !library) return false
    if (error && !replace) {
      setToast('errors.saveBeforeLoad')
      return false
    }
    saving.current = true
    try {
      const nextRevision = await saveLibrary(next, error && replace ? undefined : library)
      if (nextRevision === false) {
        setToast('errors.saveConflict')
        return false
      }
      setLibrary(next)
      setRevision(nextRevision)
      setError('')
      return true
    } catch {
      setToast('errors.saveStorage')
      return false
    } finally {
      saving.current = false
    }
  }

  if (!library)
    return (
      <main className="page" role="status">{t('common.loading')}</main>
    )

  const [, section, movieId, action, ticketId] = route.split('/')
  const movie = library.movies.find((item) => item.id === movieId)
  const ticket = library.tickets.find(
    (item) => item.id === ticketId && item.movieId === movieId,
  )
  const goHome = () => navigate('/')
  const needsBackup = exportedRevision !== revision &&
    !!(revision || library.movies.length || library.tickets.length)
  let page
  if (section === 'data') {
    page = <DataManagement library={library} save={save} notify={setToast} appVersion={appVersion}
      needsBackup={needsBackup}
      onShowSafety={() => setSafetyOpen(true)}
      onExportingChange={(value) => { exporting.current = value }}
      onExported={async () => {
        const recorded = await saveSafetyPreference('exportedRevision', revision)
        setExportedRevision(recorded ? revision : null)
        if (recorded) setBackupReminder(false)
        return recorded
      }} />
  } else if (section === 'stats') {
    const selected = library.movies.some((item) => item.id === statisticsMovieId)
      ? statisticsMovieId : 'all'
    page = (
      <>
        <Header title={t('stats.title')} back={goHome} />
        <main className="page statistics-page">
          <Field id="statistics-movie" label={t('stats.scope')}>
            <select id="statistics-movie" value={selected}
              onChange={(event) => setStatisticsMovieId(event.target.value)}>
              <option value="all">{t('movies.all')}</option>
              {library.movies.map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
          </Field>
          <Statistics tickets={selected === 'all' ? library.tickets
            : library.tickets.filter((item) => item.movieId === selected)} />
        </main>
      </>
    )
  } else if (
    section === 'new' ||
    (section === 'movies' && movie && action === 'edit')
  ) {
    page = (
      <MovieForm
        key={movie?.id || 'new'}
        movie={movie}
        library={library}
        save={save}
        notify={setToast}
      />
    )
  } else if (section === 'movies' && movie) {
    page =
      action === 'add' || (action === 'tickets' && ticket) ? (
        <TicketForm
          key={ticket?.id ?? movie.id}
          movie={movie}
          ticket={ticket}
          library={library}
          save={save}
          notify={setToast}
        />
      ) : (
        <MovieDetail
          key={movie.id}
          movie={movie}
          tickets={library.tickets.filter(
            (ticket) => ticket.movieId === movie.id,
          )}
          onChange={(ticket) =>
            save({
              ...library,
              tickets: library.tickets.map((item) =>
                item.id === ticket.id ? ticket : item,
              ),
            })
          }
          notify={setToast}
        />
      )
  } else if (section === 'archive') {
    page = (
      <>
        <Header title={t('movies.all')} back={goHome} />
        <main className="page archive-page">
          {library.movies.length ? (
            library.movies.map((item) => (
              <button
                key={item.id}
                className="archive-item"
                onClick={() => navigate(`/movies/${item.id}`)}
              >
                <Poster movie={item} />
                <div>
                  <h2>{item.title}</h2>
                  <p>{t('movies.release', { value1: formatDate(item.releaseDate) })}</p>
                  <span className="available-text">{t('tickets.remaining', { count: totals(
                        library.tickets.filter(
                          (ticket) => ticket.movieId === item.id,
                        ),
                      ).available })}</span>
                </div>
                <ChevronRight />
              </button>
            ))
          ) : (
            <EmptyState
              title={t('movies.empty')}
              action={
                <button
                  className="button primary"
                  onClick={() => navigate('/new')}
                >{t('movies.add')}</button>
              }
            />
          )}
        </main>
      </>
    )
  } else if (section) {
    page = (
      <>
        <Header title={t('common.notFound')} back={goHome} />
        <EmptyState
          title={t('movies.notFound')}
          action={
            <button className="button primary" onClick={goHome}>{t('common.home')}</button>
          }
        />
      </>
    )
  } else {
    page = (
      <Home
        library={library}
        index={Math.min(movieIndex, Math.max(0, library.movies.length - 1))}
        setIndex={setMovieIndex}
        updateAvailable={appVersion.status === 'available'}
      />
    )
  }
  return (
    <div className="app-shell">
      {error && (
        <div className="storage-error" role="alert">
          {translateMessage(error)}
        </div>
      )}
      {page}
      {safetyOpen && (
        <DataSafety notify={setToast} onClose={() => {
          setSafetyOpen(false)
          void saveSafetyPreference('noticeSeen', true).catch(() => {
            setToast('safety.noticeSaveFailed')
          })
        }} />
      )}
      {backupReminder && !safetyOpen && (
        <Sheet title={t('backup.reminderTitle')} description={t('backup.reminderDescription')}
          onClose={() => setBackupReminder(false)}>
          <div className="sheet-footer">
            <button className="button secondary" onClick={() => setBackupReminder(false)}>{t('backup.remindLater')}</button>
            <button className="button primary" onClick={() => {
              setBackupReminder(false)
              navigate('/data')
            }}>{t('backup.goExport')}</button>
          </div>
        </Sheet>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{translateMessage(toast)}</span>
          <button aria-label={t('common.dismiss')} onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

function Home({
  library,
  index,
  setIndex,
  updateAvailable,
}: {
  library: Library
  index: number
  setIndex: (index: number) => void
  updateAvailable: boolean
}) {
  const { t } = useTranslation()
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const movie = library.movies[index]
  const tickets = library.tickets.filter(
    (ticket) => ticket.movieId === movie?.id,
  )
  const counts = totals(tickets)
  return (
    <>
      <Header
        title={t('tickets.title')}
        action={
          <>
            <button className="icon-button" aria-label={t('stats.title')} onClick={() => navigate('/stats')}>
              <ChartNoAxesColumn />
            </button>
            <DataButton onClick={() => navigate('/data')} />
          </>
        }
      />
      {movie ? (
        <main className="page home-page">
          <div className="collection-heading">
            <span>
              <i className="dot available" />{t('movies.collection')}</span>
            <span>{t('movies.position', { value1: index + 1, value2: library.movies.length })}</span>
          </div>
          <section
            className="movie-card"
            aria-label={t('movies.showcase')}
            onTouchStart={(event) => setTouchStart(event.touches[0].clientX)}
            onTouchEnd={(event) => {
              if (touchStart !== null) {
                const distance = touchStart - event.changedTouches[0].clientX
                if (Math.abs(distance) > 60)
                  setIndex(
                    Math.max(
                      0,
                      Math.min(
                        library.movies.length - 1,
                        index + (distance > 0 ? 1 : -1),
                      ),
                    ),
                  )
              }
              setTouchStart(null)
            }}
          >
            <button
              className="poster-link"
              onClick={() => navigate(`/movies/${movie.id}`)}
              aria-label={t('movies.viewTickets', { value1: movie.title })}
            >
              <Poster key={movie.id + movie.poster} movie={movie} />
            </button>
            <div className="movie-meta">
              <h2>{movie.title}</h2>
              <p>{t('movies.release', { value1: formatDate(movie.releaseDate) })}</p>
            </div>
            <div className="movie-summary">
              <div className="summary-top">
                <div>
                  <strong>{t('tickets.remaining', { count: counts.available })}</strong>
                  <span>{t('tickets.totalSuffix', { count: counts.total })}</span>
                </div>
                <Badge status={counts.available ? 'available' : 'used'}>
                  {counts.available ? t('tickets.redeemable') : t('tickets.unavailable')}
                </Badge>
              </div>
              <Progress tickets={tickets} reverse />
              <StatusLegend tickets={tickets} />
            </div>
            <button
              className="button primary full-width"
              onClick={() => navigate(`/movies/${movie.id}`)}
            >{t('tickets.viewList')}<ChevronRight size={18} />
            </button>
          </section>
          <div className="carousel-controls" aria-label={t('movies.switch')}>
            <button
              className="icon-button"
              aria-label={t('movies.previous')}
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
            >
              <ArrowLeft />
            </button>
            <div className="carousel-dots">
              {library.movies.map((item, i) => (
                <button
                  key={item.id}
                  aria-label={t('movies.goTo', { value1: i + 1 })}
                  aria-current={index === i ? 'true' : undefined}
                  onClick={() => setIndex(i)}
                >
                  <span className={index === i ? 'current' : ''} />
                </button>
              ))}
            </div>
            <button
              className="icon-button"
              aria-label={t('movies.next')}
              disabled={index === library.movies.length - 1}
              onClick={() => setIndex(index + 1)}
            >
              <ArrowRight />
            </button>
          </div>
          <button
            className="button secondary full-width"
            onClick={() => navigate('/new')}
          >
            <Plus size={18} />{t('movies.add')}</button>
          <button
            className="archive-link text-button"
            onClick={() => navigate('/archive')}
          >{t('movies.all')}<ArrowRight size={16} />
          </button>
        </main>
      ) : (
        <main className="page">
          <EmptyState
            title={t('tickets.emptyAvailable')}
            action={
              <>
                <button
                  className="button primary full-width"
                  onClick={() => navigate('/new')}
                >
                  <Plus size={18} />{t('movies.add')}</button>
                <button
                  className="text-button"
                  onClick={() => navigate('/data')}
                >{t('backup.restore')}</button>
              </>
            }
          >{t('movies.getStarted')}</EmptyState>
        </main>
      )}
      <footer className="version-footer">
        <button className="text-button" onClick={() => navigate('/data')}>
          {import.meta.env.DEV ? t('updates.development') : t('updates.versionLabel', { value1: currentVersion.label })}
          {updateAvailable && <span className="primary-text">{t('updates.availableSuffix')}</span>}
        </button>
      </footer>
    </>
  )
}

export default App

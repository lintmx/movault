import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ChartNoAxesColumn, ChevronRight, Plus, X } from 'lucide-react'
import {
  navigate,
  readLibrary,
  saveLibrary,
  totals,
  formatDate,
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
} from './ui'
import { MovieDetail } from './MovieDetail'
import { MovieForm, TicketForm } from './forms'
import { DataManagement } from './DataManagement'
import './styles.css'

function App() {
  const [library, setLibrary] = useState<Library | null>(null)
  const [error, setError] = useState('')
  const saving = useRef(false)
  const [route, setRoute] = useState(() => window.location.pathname)
  const [toast, setToast] = useState('')
  const [movieIndex, setMovieIndex] = useState(0)
  const [statisticsMovieId, setStatisticsMovieId] = useState('all')

  useEffect(() => {
    let active = true
    void readLibrary().then((result) => {
      if (active) {
        setLibrary(result.data)
        setError(result.error)
      }
    })
    return () => {
      active = false
    }
  }, [])

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

  async function save(next: Library) {
    if (saving.current) return false
    saving.current = true
    try {
      await saveLibrary(next)
      setLibrary(next)
      setError('')
      return true
    } catch {
      setToast('未保存：本地存储不可用或空间不足，请先导出备份。')
      return false
    } finally {
      saving.current = false
    }
  }

  if (!library)
    return (
      <main className="page" role="status">
        正在读取本地数据…
      </main>
    )

  const [, section, movieId, action, ticketId] = route.split('/')
  const movie = library.movies.find((item) => item.id === movieId)
  const ticket = library.tickets.find(
    (item) => item.id === ticketId && item.movieId === movieId,
  )
  const goHome = () => navigate('/')
  let page
  if (section === 'data') {
    page = <DataManagement library={library} save={save} notify={setToast} />
  } else if (section === 'stats') {
    const selected = library.movies.some((item) => item.id === statisticsMovieId)
      ? statisticsMovieId : 'all'
    page = (
      <>
        <Header title="统计" back={goHome} />
        <main className="page statistics-page">
          <Field id="statistics-movie" label="统计范围">
            <select id="statistics-movie" value={selected}
              onChange={(event) => setStatisticsMovieId(event.target.value)}>
              <option value="all">全部电影</option>
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
        <Header title="全部电影" back={goHome} />
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
                  <p>{formatDate(item.releaseDate)} 上映</p>
                  <span className="available-text">
                    剩余{' '}
                    {
                      totals(
                        library.tickets.filter(
                          (ticket) => ticket.movieId === item.id,
                        ),
                      ).available
                    }{' '}
                    次
                  </span>
                </div>
                <ChevronRight />
              </button>
            ))
          ) : (
            <EmptyState
              title="暂无电影"
              action={
                <button
                  className="button primary"
                  onClick={() => navigate('/new')}
                >
                  新建电影
                </button>
              }
            />
          )}
        </main>
      </>
    )
  } else if (section) {
    page = (
      <>
        <Header title="页面不存在" back={goHome} />
        <EmptyState
          title="未找到这部电影"
          action={
            <button className="button primary" onClick={goHome}>
              返回首页
            </button>
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
      />
    )
  }
  return (
    <div className="app-shell">
      {error && (
        <div className="storage-error" role="alert">
          {error}
        </div>
      )}
      {page}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button aria-label="关闭提示" onClick={() => setToast('')}>
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
}: {
  library: Library
  index: number
  setIndex: (index: number) => void
}) {
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const movie = library.movies[index]
  const tickets = library.tickets.filter(
    (ticket) => ticket.movieId === movie?.id,
  )
  const counts = totals(tickets)
  return (
    <>
      <Header
        title="前售券"
        action={
          <>
            <button className="icon-button" aria-label="统计" onClick={() => navigate('/stats')}>
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
              <i className="dot available" />
              我的电影
            </span>
            <span>
              {index + 1} / {library.movies.length} 部作品
            </span>
          </div>
          <section
            className="movie-card"
            aria-label="电影展示"
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
              aria-label={`查看${movie.title}的前售券`}
            >
              <Poster key={movie.id + movie.poster} movie={movie} />
            </button>
            <div className="movie-meta">
              <h2>{movie.title}</h2>
              <p>{formatDate(movie.releaseDate)} 上映</p>
            </div>
            <div className="movie-summary">
              <div className="summary-top">
                <div>
                  <strong>剩余 {counts.available} 次</strong>
                  <span> / 共 {counts.total} 次</span>
                </div>
                <Badge status={counts.available ? 'available' : 'used'}>
                  {counts.available ? '可兑换' : '暂无可用'}
                </Badge>
              </div>
              <Progress tickets={tickets} reverse />
              <StatusLegend tickets={tickets} />
            </div>
            <button
              className="button primary full-width"
              onClick={() => navigate(`/movies/${movie.id}`)}
            >
              查看前售券列表
              <ChevronRight size={18} />
            </button>
          </section>
          <div className="carousel-controls" aria-label="切换电影">
            <button
              className="icon-button"
              aria-label="上一部电影"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
            >
              <ArrowLeft />
            </button>
            <div className="carousel-dots">
              {library.movies.map((item, i) => (
                <button
                  key={item.id}
                  aria-label={`跳转到第 ${i + 1} 部电影`}
                  aria-current={index === i ? 'true' : undefined}
                  onClick={() => setIndex(i)}
                >
                  <span className={index === i ? 'current' : ''} />
                </button>
              ))}
            </div>
            <button
              className="icon-button"
              aria-label="下一部电影"
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
            <Plus size={18} />
            新建电影
          </button>
          <button
            className="archive-link text-button"
            onClick={() => navigate('/archive')}
          >
            全部电影
            <ArrowRight size={16} />
          </button>
        </main>
      ) : (
        <main className="page">
          <EmptyState
            title="暂无可兑换前售券"
            action={
              <>
                <button
                  className="button primary full-width"
                  onClick={() => navigate('/new')}
                >
                  <Plus size={18} />
                  新建电影
                </button>
                <button
                  className="text-button"
                  onClick={() => navigate('/data')}
                >
                  从备份文件恢复
                </button>
              </>
            }
          >
            添加电影并录入購入番号与暗証番号，随时核对与管理兑换进度。
          </EmptyState>
        </main>
      )}
    </>
  )
}

export default App

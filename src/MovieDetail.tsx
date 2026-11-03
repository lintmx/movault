import { type Message } from './i18n'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import {
  ChevronDown,
  Minus,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import {
  formatNumber,
  navigate,
  statuses,
  statusLabels,
  totals,
  timestamp,
  typeLabels,
  type Movie,
  type Status,
  type Ticket,
  type TicketType,
} from './data'
import {
  Badge,
  CopyButton,
  DataButton,
  EmptyState,
  Field,
  Header,
  Poster,
  Progress,
  Sheet,
  Statistics,
} from './ui'

export function MovieDetail({
  movie,
  tickets,
  onChange,
  notify,
}: {
  movie: Movie
  tickets: Ticket[]
  onChange: (ticket: Ticket) => Promise<boolean>
  notify: (message: Message) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Status | 'all'>('all')
  const [type, setType] = useState<TicketType | 'all'>('all')
  const [sheet, setSheet] = useState<'stats' | 'filter' | Ticket | null>(null)
  const counts = totals(tickets)
  const priority = (ticket: Ticket) =>
    ticket.counts.available ? 0 : ticket.counts.pending ? 1 : 2
  const visible = tickets
    .filter(
      (ticket) =>
        ticket.number.includes(query.replace(/\s/g, '')) &&
        (status === 'all' || ticket.counts[status] > 0) &&
        (type === 'all' || ticket.type === type),
    )
    .sort((a, b) => priority(a) - priority(b) || a.createdAt.localeCompare(b.createdAt))
  return (
    <>
      <Header
        title={t('tickets.manage')}
        back={() => navigate('/')}
        action={<DataButton onClick={() => navigate('/data')} />}
      />
      <main className="page detail-page">
        <section className="movie-detail-heading">
          <h2>{movie.title}</h2>
          <Poster movie={movie} />
          <button
            className="icon-button"
            aria-label={t('movies.editInfo')}
            onClick={() => navigate(`/movies/${movie.id}/edit`)}
          >
            <Pencil />
          </button>
        </section>
        <section className="detail-summary">
          <div className="detail-counts">
            <strong className="available-text">{t('tickets.remaining', { count: counts.available })}</strong>
            <span className="pending-text">{t('tickets.pendingCount', { count: counts.pending })}</span>
            <span>{t('tickets.usedCount', { count: counts.used })}</span>
            <button
              className="text-button primary-text"
              onClick={() => setSheet('stats')}
            >{t('stats.details')}<ChevronDown size={16} />
            </button>
          </div>
          <Progress tickets={tickets} />
        </section>
        <section className="filters">
          <div className="search-field">
            <Search size={18} />
            <input
              type="search"
              inputMode="numeric"
              aria-label={t('tickets.search')}
              placeholder={t('tickets.searchPlaceholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                className="icon-button"
                aria-label={t('common.clearSearch')}
                onClick={() => setQuery('')}
              >
                <X size={16} />
              </button>
            )}
          </div>
          <div className="filter-row">
            <div className="filter-tabs" aria-label={t('tickets.status')}>
              {(['all', ...statuses] as const).map((item) => (
                <button
                  key={item}
                  aria-pressed={status === item}
                  className={status === item ? 'selected' : ''}
                  onClick={() => setStatus(item)}
                >
                  {item === 'all' ? t('common.all') : t(statusLabels[item])}{' '}
                  <span>
                    (
                    {item === 'all'
                      ? tickets.length
                      : tickets.filter((ticket) => ticket.counts[item] > 0)
                          .length}
                    )
                  </span>
                </button>
              ))}
            </div>
            <button
              className={`icon-button type-filter ${type !== 'all' ? 'primary-text' : ''}`}
              aria-label={t('tickets.filterType', { value1: type === 'all' ? t('tickets.allTypes') : t(typeLabels[type]) })}
              onClick={() => setSheet('filter')}
            >
              <SlidersHorizontal size={18} />
            </button>
          </div>
          {type !== 'all' && (
            <button
              className="text-button active-filter"
              onClick={() => setType('all')}
            >
              {t(typeLabels[type])}
              <X size={14} />
            </button>
          )}
        </section>
        <section aria-label={t('tickets.list')} className="ticket-list">
          {visible.map((ticket) => (
            <article
              className={`ticket-row ${ticket.counts.used === totals([ticket]).total ? 'consumed' : ''}`}
              key={ticket.id}
            >
              <div className="ticket-toolbar">
                <div className="ticket-badges">
                  <Badge
                    status={ticket.type === 'digital' ? 'digital' : undefined}
                  >
                    {t(typeLabels[ticket.type])}
                  </Badge>
                  {ticket.type === 'physical' ? (
                    <Badge
                      status={statuses.find((state) => ticket.counts[state])}
                    >
                      {
                        t(statusLabels[
                          statuses.find((state) => ticket.counts[state])!
                        ])
                      }
                    </Badge>
                  ) : (
                    <span className="muted">{t('tickets.totalCount', { count: totals([ticket]).total })}</span>
                  )}
                </div>
                <div className="ticket-actions">
                  <button
                    className="text-button"
                    onClick={() => setSheet(ticket)}
                  >{t('tickets.changeStatus')}</button>
                  <CopyButton
                    text={t('tickets.credentials', { value1: ticket.number, value2: ticket.pin })}
                    label={t('tickets.copyAll')}
                    notify={notify}
                  />
                  <button
                    className="icon-button"
                    aria-label={t('tickets.editNumber', { value1: ticket.number })}
                    onClick={() =>
                      navigate(`/movies/${movie.id}/tickets/${ticket.id}`)
                    }
                  >
                    <Pencil size={16} />
                  </button>
                </div>
              </div>
              {ticket.type === 'digital' && (
                <div className="ticket-statuses">
                  {statuses.map((state) => (
                    <Badge key={state} status={state}>{t('tickets.statusCount', { value1: t(statusLabels[state]), count: ticket.counts[state] })}</Badge>
                  ))}
                </div>
              )}
              <div className="credentials">
                <div>
                  <span>{t('tickets.number')}</span>
                  <strong>{formatNumber(ticket.number)}</strong>
                  <CopyButton
                    text={ticket.number}
                    label={t('tickets.copyNumber')}
                    compact
                    notify={notify}
                  />
                </div>
                <div>
                  <span>{t('tickets.pin')}</span>
                  <strong>{ticket.pin}</strong>
                  <CopyButton
                    text={ticket.pin}
                    label={t('tickets.copyPin')}
                    compact
                    notify={notify}
                  />
                </div>
              </div>
              {ticket.note && <p className="ticket-note">{ticket.note}</p>}
            </article>
          ))}
          {!visible.length && (
            <EmptyState
              title={tickets.length ? t('tickets.noMatches') : t('tickets.empty')}
              action={
                tickets.length ? (
                  <button
                    className="text-button primary-text"
                    onClick={() => {
                      setQuery('')
                      setStatus('all')
                      setType('all')
                    }}
                  >{t('tickets.clearFilters')}</button>
                ) : undefined
              }
            >
              {tickets.length
                ? undefined
                : t('tickets.getStarted')}
            </EmptyState>
          )}
        </section>
      </main>
      <div className="bottom-bar">
        <button
          className="button primary full-width"
          onClick={() => navigate(`/movies/${movie.id}/add`)}
        >
          <Plus size={20} />{t('tickets.add')}</button>
      </div>
      {sheet === 'filter' && (
        <Sheet title={t('tickets.type')} onClose={() => setSheet(null)}>
          <div className="sheet-body option-list">
            {(['all', 'physical', 'digital'] as const).map((item) => (
              <label className="radio-option" key={item}>
                <input
                  type="radio"
                  name="ticket-type-filter"
                  checked={type === item}
                  onChange={() => {
                    setType(item)
                    setSheet(null)
                  }}
                />
                {item === 'all' ? t('tickets.allTypes') : t(typeLabels[item])}
              </label>
            ))}
          </div>
        </Sheet>
      )}
      {sheet === 'stats' && (
        <Sheet
          title={t('stats.redemptionDetails')}
          description={movie.title}
          onClose={() => setSheet(null)}
        >
          <div className="sheet-body stats-body">
            <Statistics tickets={tickets} />
            <button
              className="button secondary full-width"
              onClick={() => setSheet(null)}
            >{t('common.done')}</button>
          </div>
        </Sheet>
      )}
      {sheet && typeof sheet === 'object' && (
        <StatusSheet
          ticket={sheet}
          onClose={() => setSheet(null)}
          onSave={async (ticket) => {
            if (await onChange(ticket)) {
              setSheet(null)
              notify('tickets.statusSaved')
            }
          }}
        />
      )}
    </>
  )
}

function StatusSheet({
  ticket,
  onClose,
  onSave,
}: {
  ticket: Ticket
  onClose: () => void
  onSave: (ticket: Ticket) => Promise<void>
}) {
  const { t } = useTranslation()
  const [source, setSource] = useState<Status>(
    statuses.find((status) => ticket.counts[status] > 0)!,
  )
  const [target, setTarget] = useState<Status>(
    source === 'available' ? 'pending' : 'available',
  )
  const [amount, setAmount] = useState(1)
  const [note, setNote] = useState(ticket.note)
  const digital = ticket.type === 'digital'
  async function submit() {
    if (source === target || amount < 1 || amount > ticket.counts[source])
      return
    const counts = {
      ...ticket.counts,
      [source]: ticket.counts[source] - amount,
      [target]: ticket.counts[target] + amount,
    }
    await onSave({ ...ticket, counts, note, updatedAt: timestamp() })
  }
  return (
    <Sheet
      title={t('tickets.editStatus')}
      description={t('tickets.statusDescription', { value1: t(typeLabels[ticket.type]), value2: formatNumber(ticket.number) })}
      onClose={onClose}
    >
      <div className="current-counts">
        {statuses.map((status) => (
          <Badge key={status} status={status}>
            {t(statusLabels[status])}
            {digital
              ? t('tickets.countSuffix', { count: ticket.counts[status] })
              : ticket.counts[status]
                ? t('tickets.current')
                : ''}
          </Badge>
        ))}
      </div>
      <div className="sheet-body status-form">
        {digital && (
          <fieldset>
            <legend>{t('tickets.sourceStatus')}</legend>
            <div className="three-options">
              {statuses.map((status) => (
                <label
                  className={`choice ${source === status ? 'selected' : ''} ${!ticket.counts[status] ? 'disabled' : ''}`}
                  key={status}
                >
                  <input
                    type="radio"
                    name="source"
                    disabled={!ticket.counts[status]}
                    checked={source === status}
                    onChange={() => {
                      setSource(status)
                      setAmount(1)
                      if (target === status)
                        setTarget(statuses.find((item) => item !== status)!)
                    }}
                  />
                  {t(statusLabels[status])}
                  <span>{t('tickets.countParentheses', { count: ticket.counts[status] })}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <fieldset>
          <legend>{digital ? t('tickets.targetStatus') : t('tickets.selectStatus')}</legend>
          <div className="three-options">
            {statuses.map((status) => (
              <label
                className={`choice ${target === status ? `selected ${status}` : ''} ${source === status ? 'disabled' : ''}`}
                key={status}
              >
                <input
                  type="radio"
                  name="target"
                  disabled={source === status}
                  checked={target === status}
                  onChange={() => setTarget(status)}
                />
                {t(statusLabels[status])}
              </label>
            ))}
          </div>
        </fieldset>
        {digital && (
          <div className="quantity-row">
            <div>
              <label htmlFor="status-quantity">{t('tickets.changeQuantity')}</label>
              <p className="hint">{t('tickets.maximum', { count: ticket.counts[source] })}</p>
            </div>
            <div className="stepper">
              <button
                className="icon-button"
                aria-label={t('tickets.decrease')}
                disabled={amount <= 1}
                onClick={() => setAmount(amount - 1)}
              >
                <Minus size={18} />
              </button>
              <output id="status-quantity">{amount}</output>
              <button
                className="icon-button"
                aria-label={t('tickets.increase')}
                disabled={amount >= ticket.counts[source]}
                onClick={() => setAmount(amount + 1)}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
        )}
        <Field id="status-note" label={t('tickets.optionalNote')}>
          <input
            id="status-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('tickets.statusNotePlaceholder')}
            maxLength={200}
          />
        </Field>
      </div>
      <div className="sheet-footer">
        <button className="button secondary" onClick={onClose}>{t('common.cancel')}</button>
        <button className="button primary" onClick={submit}>{t('tickets.saveStatus')}</button>
      </div>
    </Sheet>
  )
}

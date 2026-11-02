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
  notify: (message: string) => void
}) {
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
        title="前售券管理"
        back={() => navigate('/')}
        action={<DataButton onClick={() => navigate('/data')} />}
      />
      <main className="page detail-page">
        <section className="movie-detail-heading">
          <h2>{movie.title}</h2>
          <Poster movie={movie} />
          <button
            className="icon-button"
            aria-label="编辑电影信息"
            onClick={() => navigate(`/movies/${movie.id}/edit`)}
          >
            <Pencil />
          </button>
        </section>
        <section className="detail-summary">
          <div className="detail-counts">
            <strong className="available-text">
              剩余 {counts.available} 次
            </strong>
            <span className="pending-text">待确认 {counts.pending} 次</span>
            <span>已使用 {counts.used} 次</span>
            <button
              className="text-button primary-text"
              onClick={() => setSheet('stats')}
            >
              统计详情
              <ChevronDown size={16} />
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
              aria-label="按購入番号搜索"
              placeholder="按購入番号搜索…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                className="icon-button"
                aria-label="清除搜索"
                onClick={() => setQuery('')}
              >
                <X size={16} />
              </button>
            )}
          </div>
          <div className="filter-row">
            <div className="filter-tabs" aria-label="前售券状态">
              {(['all', ...statuses] as const).map((item) => (
                <button
                  key={item}
                  aria-pressed={status === item}
                  className={status === item ? 'selected' : ''}
                  onClick={() => setStatus(item)}
                >
                  {item === 'all' ? '全部' : statusLabels[item]}{' '}
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
              aria-label={`筛选券种类型：${type === 'all' ? '全部类型' : typeLabels[type]}`}
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
              {typeLabels[type]}
              <X size={14} />
            </button>
          )}
        </section>
        <section aria-label="前售券列表" className="ticket-list">
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
                    {typeLabels[ticket.type]}
                  </Badge>
                  {ticket.type === 'physical' ? (
                    <Badge
                      status={statuses.find((state) => ticket.counts[state])}
                    >
                      {
                        statusLabels[
                          statuses.find((state) => ticket.counts[state])!
                        ]
                      }
                    </Badge>
                  ) : (
                    <span className="muted">
                      共 {totals([ticket]).total} 次
                    </span>
                  )}
                </div>
                <div className="ticket-actions">
                  <button
                    className="text-button"
                    onClick={() => setSheet(ticket)}
                  >
                    更改状态
                  </button>
                  <CopyButton
                    text={`購入番号：${ticket.number}\n暗証番号：${ticket.pin}`}
                    label="复制全部"
                    notify={notify}
                  />
                  <button
                    className="icon-button"
                    aria-label={`编辑前售券 ${ticket.number}`}
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
                    <Badge key={state} status={state}>
                      {statusLabels[state]} {ticket.counts[state]} 次
                    </Badge>
                  ))}
                </div>
              )}
              <div className="credentials">
                <div>
                  <span>購入番号</span>
                  <strong>{formatNumber(ticket.number)}</strong>
                  <CopyButton
                    text={ticket.number}
                    label="复制購入番号"
                    compact
                    notify={notify}
                  />
                </div>
                <div>
                  <span>暗証番号</span>
                  <strong>{ticket.pin}</strong>
                  <CopyButton
                    text={ticket.pin}
                    label="复制暗証番号"
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
              title={tickets.length ? '没有符合条件的前售券' : '暂无前售券'}
              action={
                tickets.length ? (
                  <button
                    className="text-button primary-text"
                    onClick={() => {
                      setQuery('')
                      setStatus('all')
                      setType('all')
                    }}
                  >
                    清除筛选
                  </button>
                ) : undefined
              }
            >
              {tickets.length
                ? undefined
                : '添加購入番号与暗証番号，开始管理兑换。'}
            </EmptyState>
          )}
        </section>
      </main>
      <div className="bottom-bar">
        <button
          className="button primary full-width"
          onClick={() => navigate(`/movies/${movie.id}/add`)}
        >
          <Plus size={20} />
          添加前售券
        </button>
      </div>
      {sheet === 'filter' && (
        <Sheet title="前售券类型" onClose={() => setSheet(null)}>
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
                {item === 'all' ? '全部类型' : typeLabels[item]}
              </label>
            ))}
          </div>
        </Sheet>
      )}
      {sheet === 'stats' && (
        <Sheet
          title="兑换统计详情"
          description={movie.title}
          onClose={() => setSheet(null)}
        >
          <div className="sheet-body stats-body">
            <Statistics tickets={tickets} />
            <button
              className="button secondary full-width"
              onClick={() => setSheet(null)}
            >
              完成
            </button>
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
              notify('已更新使用状态')
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
      title="修改使用状态"
      description={`${typeLabels[ticket.type]}　購入番号 ${formatNumber(ticket.number)}`}
      onClose={onClose}
    >
      <div className="current-counts">
        {statuses.map((status) => (
          <Badge key={status} status={status}>
            {statusLabels[status]}
            {digital
              ? ` ${ticket.counts[status]} 次`
              : ticket.counts[status]
                ? '（当前）'
                : ''}
          </Badge>
        ))}
      </div>
      <div className="sheet-body status-form">
        {digital && (
          <fieldset>
            <legend>从当前状态转出</legend>
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
                  {statusLabels[status]}
                  <span>({ticket.counts[status]} 次)</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <fieldset>
          <legend>{digital ? '改为目标状态' : '选择使用状态'}</legend>
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
                {statusLabels[status]}
              </label>
            ))}
          </div>
        </fieldset>
        {digital && (
          <div className="quantity-row">
            <div>
              <label htmlFor="status-quantity">变更次数</label>
              <p className="hint">最多 {ticket.counts[source]} 次</p>
            </div>
            <div className="stepper">
              <button
                className="icon-button"
                aria-label="减少次数"
                disabled={amount <= 1}
                onClick={() => setAmount(amount - 1)}
              >
                <Minus size={18} />
              </button>
              <output id="status-quantity">{amount}</output>
              <button
                className="icon-button"
                aria-label="增加次数"
                disabled={amount >= ticket.counts[source]}
                onClick={() => setAmount(amount + 1)}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
        )}
        <Field id="status-note" label="备注（选填）">
          <input
            id="status-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="例如：已提交影院在线选座"
            maxLength={200}
          />
        </Field>
      </div>
      <div className="sheet-footer">
        <button className="button secondary" onClick={onClose}>
          取消
        </button>
        <button className="button primary" onClick={submit}>
          保存状态
        </button>
      </div>
    </Sheet>
  )
}

import { useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowLeft, Check, Copy, Database, Film, X } from 'lucide-react'
import {
  statuses,
  statusLabels,
  totals,
  yen,
  type Movie,
  type Status,
  type Ticket,
} from './data'

export function Header({
  title,
  back,
  action,
}: {
  title: string
  back?: () => void
  action?: ReactNode
}) {
  return (
    <header className={`header ${back ? '' : 'home-header'}`}>
      {back ? (
        <button className="icon-button" aria-label="返回" onClick={back}>
          <ArrowLeft />
        </button>
      ) : (
        <span className="wordmark">ムビチケ</span>
      )}
      {back && <h1>{title}</h1>}
      <div className="header-action">{action}</div>
    </header>
  )
}

export function DataButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="icon-button" aria-label="数据管理" onClick={onClick}>
      <Database />
    </button>
  )
}

export function Poster({
  movie,
  className = '',
}: {
  movie: Pick<Movie, 'title' | 'poster'>
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  return (
    <div className={`poster ${className}`}>
      {movie.poster && !failed ? (
        <img
          src={movie.poster}
          alt={`${movie.title} 海报`}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="poster-placeholder">
          <Film />
          <span>未设海报</span>
        </div>
      )}
    </div>
  )
}

export function Badge({
  status,
  children,
}: {
  status?: Status | 'digital'
  children: ReactNode
}) {
  return <span className={`badge ${status ?? 'neutral'}`}>{children}</span>
}

export function Progress({
  tickets,
  reverse = false,
}: {
  tickets: Ticket[]
  reverse?: boolean
}) {
  const counts = totals(tickets)
  return (
    <div
      className="progress"
      role="img"
      aria-label={`未使用 ${counts.available} 次，待确认 ${counts.pending} 次，已使用 ${counts.used} 次`}
    >
      {(reverse ? [...statuses].reverse() : statuses).map((status) => (
        <span
          key={status}
          className={status}
          style={{
            width: `${counts.total ? (counts[status] / counts.total) * 100 : 0}%`,
          }}
        />
      ))}
    </div>
  )
}

export function StatusLegend({ tickets }: { tickets: Ticket[] }) {
  const counts = totals(tickets)
  return (
    <div className="status-legend">
      {statuses.map((status) => (
        <span key={status}>
          <i className={`dot ${status}`} />
          {statusLabels[status]} {counts[status]} 次
        </span>
      ))}
    </div>
  )
}

export function Statistics({ tickets }: { tickets: Ticket[] }) {
  const counts = totals(tickets)
  const rate = counts.total ? Math.round(counts.used / counts.total * 100) : 0
  return (
    <div className="stats-body">
      <div className="stat-overview">
        <span>剩余可兑换次数</span>
        <strong className="available-text">{counts.available} 次</strong>
      </div>
      <dl className="stats-list">
        <div><dt>前售券记录</dt><dd>{tickets.length} 张</dd></div>
        <div><dt>总兑换次数</dt><dd>{counts.total} 次</dd></div>
        <div><dt>使用率</dt><dd>{rate}%</dd></div>
      </dl>
      <h3>兑换进度</h3>
      <Progress tickets={tickets} />
      <dl className="stats-list">
        {statuses.map((status) => (
          <div key={status}>
            <dt><i className={`dot ${status}`} />{statusLabels[status]}</dt>
            <dd>{counts[status]} 次</dd>
          </div>
        ))}
      </dl>
      <h3>金额分布（日元）</h3>
      <dl className="stats-list">
        <div><dt>总购买金额</dt><dd>{yen(counts.price)}</dd></div>
        {statuses.map((status) => (
          <div key={status}>
            <dt>{statusLabels[status]}金额</dt>
            <dd>{yen(counts.amounts[status])}</dd>
          </div>
        ))}
      </dl>
      <p className="hint">每张券总价按日元取整后按次数分摊，尾差补给小数余数较大的状态。</p>
    </div>
  )
}

export function Sheet({
  title,
  description,
  children,
  onClose,
}: {
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
}) {
  const [opener] = useState(() => document.activeElement as HTMLElement | null)
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay" />
        <Dialog.Content
          className="sheet"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            opener?.focus()
          }}
        >
          <div className="sheet-handle" />
          <div className="sheet-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="icon-button" aria-label="关闭">
                <X />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description
            className={description ? 'sheet-description' : 'sr-only'}
          >
            {description || title}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function CopyButton({
  text,
  label,
  compact = false,
  notify,
}: {
  text: string
  label: string
  compact?: boolean
  notify: (message: string) => void
}) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      notify('未能复制，请长按号码选择并复制。')
    }
  }
  return (
    <button
      className={
        compact ? 'icon-button copy-button' : 'text-button primary-text'
      }
      aria-label={copied ? '已复制' : label}
      onClick={copy}
    >
      {compact ? copied ? <Check /> : <Copy /> : copied ? '已复制' : label}
    </button>
  )
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Film />
      </div>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function Field({
  label,
  id,
  hint,
  error,
  children,
}: {
  label: string
  id: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="field">
      <div className="field-label">
        <label htmlFor={id}>{label}</label>
        {hint && <span>{hint}</span>}
      </div>
      {children}
      {error && (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

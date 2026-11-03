import { type Message, translateMessage, yen } from './i18n'
import { useTranslation } from 'react-i18next'
import { useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowLeft, Check, Copy, Database, Film, X } from 'lucide-react'
import {
  statuses,
  statusLabels,
  totals,
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
  const { t } = useTranslation()
  return (
    <header className={`header ${back ? '' : 'home-header'}`}>
      {back ? (
        <button className="icon-button" aria-label={t('common.back')} onClick={back}>
          <ArrowLeft />
        </button>
      ) : (
        <span className="wordmark">{t('common.wordmark')}</span>
      )}
      {back && <h1>{title}</h1>}
      <div className="header-action">{action}</div>
    </header>
  )
}

export function DataButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button className="icon-button" aria-label={t('backup.title')} onClick={onClick}>
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
  const { t } = useTranslation()
  const [failed, setFailed] = useState(false)
  return (
    <div className={`poster ${className}`}>
      {movie.poster && !failed ? (
        <img
          src={movie.poster}
          alt={t('movies.posterAlt', { value1: movie.title })}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="poster-placeholder">
          <Film />
          <span>{t('movies.noPoster')}</span>
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
  const { t } = useTranslation()
  const counts = totals(tickets)
  return (
    <div
      className="progress"
      role="img"
      aria-label={t('stats.progressDescription', { value1: counts.available, value2: counts.pending, value3: counts.used })}
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
  const { t } = useTranslation()
  const counts = totals(tickets)
  return (
    <div className="status-legend">
      {statuses.map((status) => (
        <span key={status}>
          <i className={`dot ${status}`} />{t('tickets.statusCount', { value1: t(statusLabels[status]), count: counts[status] })}</span>
      ))}
    </div>
  )
}

export function Statistics({ tickets }: { tickets: Ticket[] }) {
  const { t } = useTranslation()
  const counts = totals(tickets)
  const rate = counts.total ? Math.round(counts.used / counts.total * 100) : 0
  return (
    <div className="stats-body">
      <div className="stat-overview">
        <span>{t('stats.remaining')}</span>
        <strong className="available-text">{t('tickets.count', { count: counts.available })}</strong>
      </div>
      <dl className="stats-list">
        <div><dt>{t('stats.ticketRecords')}</dt><dd>{t('tickets.ticketCount', { count: tickets.length })}</dd></div>
        <div><dt>{t('stats.totalRedemptions')}</dt><dd>{t('tickets.count', { count: counts.total })}</dd></div>
        <div><dt>{t('stats.usageRate')}</dt><dd>{rate}%</dd></div>
      </dl>
      <h3>{t('stats.progress')}</h3>
      <Progress tickets={tickets} />
      <dl className="stats-list">
        {statuses.map((status) => (
          <div key={status}>
            <dt><i className={`dot ${status}`} />{t(statusLabels[status])}</dt>
            <dd>{t('tickets.count', { count: counts[status] })}</dd>
          </div>
        ))}
      </dl>
      <h3>{t('stats.amounts')}</h3>
      <dl className="stats-list">
        <div><dt>{t('stats.totalPrice')}</dt><dd>{yen(counts.price)}</dd></div>
        {statuses.map((status) => (
          <div key={status}>
            <dt>{t('stats.statusAmount', { value1: t(statusLabels[status]) })}</dt>
            <dd>{yen(counts.amounts[status])}</dd>
          </div>
        ))}
      </dl>
      <p className="hint">{t('stats.roundingHelp')}</p>
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
  const { t } = useTranslation()
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
              <button className="icon-button" aria-label={t('common.close')}>
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
  notify: (message: Message) => void
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      notify('common.copyFailed')
    }
  }
  return (
    <button
      className={
        compact ? 'icon-button copy-button' : 'text-button primary-text'
      }
      aria-label={copied ? t('common.copied') : label}
      onClick={copy}
    >
      {compact ? copied ? <Check /> : <Copy /> : copied ? t('common.copied') : label}
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
  error?: Message
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
          {translateMessage(error)}
        </p>
      )}
    </div>
  )
}

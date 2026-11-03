import { type Message, translateMessage, yen } from './i18n'
import { useTranslation } from 'react-i18next'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  Check,
  CircleCheck,
  Film,
  ImagePlus,
  Info,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import {
  navigate,
  credentialKey,
  readImage,
  totals,
  timestamp,
  typeLabels,
  type Library,
  type Movie,
  type Ticket,
  type TicketType,
} from './data'
import { Badge, Field, Header, Poster, Sheet } from './ui'
import { OcrScanner } from './OcrScanner'

type FormProps = {
  library: Library
  save: (library: Library) => Promise<boolean>
  notify: (message: Message) => void
}

export function MovieForm({
  movie,
  library,
  save,
  notify,
}: FormProps & { movie?: Movie }) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(movie?.title ?? '')
  const [date, setDate] = useState(movie?.releaseDate ?? '')
  const [price, setPrice] = useState(String(movie?.price ?? 1500))
  const [poster, setPoster] = useState(movie?.poster ?? '')
  const [errors, setErrors] = useState<Record<string, Message>>({})
  const [deleting, setDeleting] = useState(false)
  const upload = useRef<HTMLInputElement>(null)
  const back = () => navigate(movie ? `/movies/${movie.id}` : '/')
  const count = library.tickets.filter(
    (ticket) => ticket.movieId === movie?.id,
  ).length
  async function submit(event: FormEvent) {
    event.preventDefault()
    const nextErrors: Record<string, Message> = {}
    if (!title.trim()) nextErrors.title = 'movies.titleRequired'
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      nextErrors.date = 'movies.dateRequired'
    if (!price || !Number.isFinite(Number(price)) || Number(price) < 0)
      nextErrors.price = 'tickets.invalidPrice'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    const now = timestamp()
    const nextMovie: Movie = {
      id: movie?.id ?? crypto.randomUUID(),
      title: title.trim(),
      releaseDate: date,
      price: Number(price),
      poster,
      createdAt: movie?.createdAt ?? now,
      updatedAt: now,
    }
    if (
      await save({
        ...library,
        movies: movie
          ? library.movies.map((item) =>
              item.id === movie.id ? nextMovie : item,
            )
          : [...library.movies, nextMovie],
      })
    ) {
      notify('movies.saved')
      navigate(`/movies/${nextMovie.id}`)
    }
  }
  async function pickPoster(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) {
      try {
        setPoster(await readImage(file))
      } catch (error) {
        notify((error as Error).message)
      }
    }
    event.target.value = ''
  }
  return (
    <>
      <Header title={movie ? t('movies.edit') : t('movies.add')} back={back} />
      <main className="page form-page">
        <form
          id="movie-form"
          className="form-stack"
          noValidate
          onSubmit={submit}
        >
          <section className="poster-editor">
            <div className="field-label">
              <span>{t('movies.poster')}</span>
              <span>{t('common.optional')}</span>
            </div>
            <div className="poster-upload-row">
              <Poster
                key={poster}
                movie={{
                  title,
                  poster,
                }}
              />
              <div>
                <h2>{t('movies.uploadPoster')}</h2>
                <p className="hint">{t('movies.posterFormats')}<br />{t('movies.posterRatio')}</p>
                <div className="poster-actions">
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => upload.current?.click()}
                  >
                    <ImagePlus size={16} />
                    {poster ? t('movies.changePoster') : t('movies.chooseImage')}
                  </button>
                  {poster && (
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={t('movies.removePoster')}
                      onClick={() => setPoster('')}
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <input
              hidden
              ref={upload}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={pickPoster}
            />
          </section>
          <Field
            id="movie-title"
            label={t('movies.titleLabel')}
            hint={t('movies.titleHint')}
            error={errors.title}
          >
            <input
              id="movie-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('movies.titlePlaceholder')}
              maxLength={160}
              required
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? 'movie-title-error' : undefined}
            />
          </Field>
          <Field
            id="movie-date"
            label={t('movies.dateLabel')}
            hint={t('movies.dateHint')}
            error={errors.date}
          >
            <input
              id="movie-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
              aria-invalid={!!errors.date}
              aria-describedby={errors.date ? 'movie-date-error' : undefined}
            />
          </Field>
          <Field
            id="movie-price"
            label={t('movies.priceLabel')}
            hint={t('common.yen')}
            error={errors.price}
          >
            <div className="money-input">
              <span>¥</span>
              <input
                id="movie-price"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                required
                aria-invalid={!!errors.price}
                aria-describedby={
                  errors.price ? 'movie-price-error' : undefined
                }
              />
            </div>
            <p className="hint">{t('movies.priceHint')}</p>
          </Field>
          {movie && (
            <button
              className="text-button danger-text delete-movie"
              type="button"
              onClick={() => setDeleting(true)}
            >
              <Trash2 size={18} />{t('movies.delete')}</button>
          )}
        </form>
      </main>
      <div className="bottom-bar">
        <button className="button secondary" onClick={back}>{t('common.cancel')}</button>
        <button form="movie-form" className="button primary grow" type="submit">
          <Check size={18} />{t('movies.save')}</button>
      </div>
      {deleting && movie && (
        <Sheet
          title={t('movies.delete')}
          description={t('movies.deleteConfirm', { value1: movie.title, count: count })}
          onClose={() => setDeleting(false)}
        >
          <div className="sheet-footer">
            <button
              className="button secondary"
              onClick={() => setDeleting(false)}
            >{t('common.cancel')}</button>
            <button
              className="button danger"
              onClick={async () => {
                if (
                  await save({
                    movies: library.movies.filter(
                      (item) => item.id !== movie.id,
                    ),
                    tickets: library.tickets.filter(
                      (ticket) => ticket.movieId !== movie.id,
                    ),
                  })
                ) {
                  notify('movies.deleted')
                  navigate('/')
                }
              }}
            >{t('common.confirmDelete')}</button>
          </div>
        </Sheet>
      )}
    </>
  )
}

function validateCode(value: string, code: string) {
  if (!/^\d{10}$/.test(value)) return 'tickets.numberInvalid'
  if (!/^\d{4}$/.test(code)) return 'tickets.pinInvalid'
  return ''
}

type BatchRow = {
  line: number
  number: string
  pin: string
  quantity: string
  price: string
  parseError: string
}

export function TicketForm({
  movie,
  ticket,
  library,
  save,
  notify,
}: FormProps & { movie: Movie; ticket?: Ticket }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'single' | 'batch' | 'photo'>('single')
  const [type, setType] = useState<TicketType>(ticket?.type ?? 'physical')
  const [number, setNumber] = useState(ticket?.number ?? '')
  const [pin, setPin] = useState(ticket?.pin ?? '')
  const [quantity, setQuantity] = useState(
    String(ticket ? totals([ticket]).total : 1),
  )
  const [price, setPrice] = useState(ticket ? String(ticket.price) : '')
  const [continuous, setContinuous] = useState(!ticket)
  const [note, setNote] = useState(ticket?.note ?? '')
  const [showNote, setShowNote] = useState(!!ticket)
  const [deleting, setDeleting] = useState(false)
  const [errors, setErrors] = useState<Record<string, Message>>({})
  const [batch, setBatch] = useState('')
  const [rows, setRows] = useState<BatchRow[] | null>(null)
  const [ocrReady, setOcrReady] = useState(false)
  const [scanReset, setScanReset] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const submitLock = useRef(false)
  const [switching, setSwitching] = useState(false)
  const numberInput = useRef<HTMLInputElement>(null)
  const back = () => { if (!submitLock.current) navigate(`/movies/${movie.id}`) }
  const existing = new Set(
    library.tickets
      .filter((item) => item.movieId === movie.id && item.id !== ticket?.id)
      .map((item) => credentialKey(movie.id, item.number, item.pin)),
  )
  const activeType = mode === 'photo' ? 'physical' : type
  const total = activeType === 'physical' ? 1 : Number(quantity)
  const defaultPrice = movie.price * (Number.isSafeInteger(total) && total > 0 ? total : 1)
  const effectivePrice = price === '' ? defaultPrice : Number(price)
  const duplicate = existing.has(credentialKey(movie.id, number, pin))
  const seen = new Set<string>()
  const checkedRows = (rows ?? []).map((row) => {
    const total = activeType === 'physical' ? 1 : Number(row.quantity || quantity)
    const amount = Number(row.price || price || movie.price * total)
    const error = row.parseError || validateCode(row.number, row.pin) ||
      (!Number.isSafeInteger(total) || total < 1 ? 'tickets.quantityInvalid' : '') ||
      (!Number.isFinite(amount) || amount < 0 ? 'tickets.invalidPrice' : '')
    const key = credentialKey(movie.id, row.number, row.pin)
    const duplicate = !error && (existing.has(key) || seen.has(key))
    if (!error) seen.add(key)
    return { ...row, total, amount, error, duplicate }
  })
  const validRows = checkedRows.filter((row) => !row.error)
  const duplicateRows = checkedRows.filter((row) => row.duplicate).length

  function updateRow(line: number, changes: Partial<BatchRow>) {
    setRows((current) => current?.map((row) => row.line === line
      ? {
          ...row, ...changes,
          parseError: changes.number !== undefined || changes.pin !== undefined ? '' : row.parseError,
        } : row) ?? null)
    setErrors({})
  }
  function parseBatch() {
    const nextRows = batch
      .split(/\r?\n/)
      .map((text, index) => ({ text: text.trim(), line: index + 1 }))
      .filter((row) => row.text)
      .map((row) => {
        const values = row.text.split(/[\s,，;；\t]+/)
        const value = values[0] ?? ''
        const code = values[1] ?? ''
        return {
          line: row.line, number: value, pin: code, quantity: '', price: '',
          parseError: values.length !== 2 ? 'tickets.batchFormat' : '',
        }
      })
    setRows(nextRows)
    if (!nextRows.length) setErrors({ batch: 'tickets.batchRequired' })
    else setErrors({})
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitLock.current) return
    if (mode === 'batch' && !rows) {
      parseBatch()
      return
    }
    const now = timestamp()
    const nextErrors: Record<string, Message> = {}
    if (mode !== 'batch' && (!Number.isFinite(effectivePrice) || effectivePrice < 0))
      nextErrors.price = 'tickets.invalidPrice'
    if (
      mode !== 'batch' && activeType === 'digital' &&
      (!Number.isSafeInteger(Number(quantity)) || Number(quantity) < 1)
    )
      nextErrors.quantity = 'tickets.quantityInvalid'
    const pending = ticket?.counts.pending ?? 0
    const used = ticket?.counts.used ?? 0
    if (ticket && total < pending + used)
      nextErrors.quantity = { key: 'tickets.quantityTooSmall', values: { count: pending + used } }
    if (mode !== 'batch') {
      if (!/^\d{10}$/.test(number)) nextErrors.number = 'tickets.numberInvalid'
      if (!/^\d{4}$/.test(pin)) nextErrors.pin = 'tickets.pinInvalid'
      if (mode === 'photo' && !ocrReady)
        nextErrors.photo = 'ocr.reviewRequired'
    } else if (!validRows.length)
      nextErrors.batch = 'tickets.noValidRows'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    const values = mode === 'batch' ? validRows : [{ number, pin, total, amount: effectivePrice }]
    const added: Ticket[] = values.map((value) => ({
      id: ticket?.id ?? crypto.randomUUID(),
      movieId: movie.id,
      type: activeType,
      number: value.number,
      pin: value.pin,
      counts: {
        available: value.total - pending - used,
        pending,
        used,
      },
      price: value.amount,
      note,
      createdAt: ticket?.createdAt ?? now,
      updatedAt: now,
    }))
    submitLock.current = true
    setSubmitting(true)
    let saved = false
    try {
      saved = await save({
        ...library,
        tickets: ticket
          ? library.tickets.map((item) => item.id === ticket.id ? added[0] : item)
          : [...library.tickets, ...added],
      })
    } finally {
      submitLock.current = false
      setSubmitting(false)
    }
    if (!saved) return
    notify(ticket ? 'tickets.savedChanges' : { key: 'tickets.saved', values: { count: added.length } })
    if ((mode === 'single' || mode === 'photo') && continuous) {
      setNumber('')
      setPin('')
      if (mode === 'photo') { setOcrReady(false); setScanReset((value) => value + 1) }
      else numberInput.current?.focus()
    } else if (mode === 'batch' && checkedRows.some((row) => row.error)) {
      const remaining = checkedRows.filter((row) => row.error)
      setBatch(
        remaining
          .map((row) => `${row.number} ${row.pin}`)
          .join('\n'),
      )
      setRows(remaining)
    } else back()
  }
  function changeType(next: TicketType) {
    setType(next)
    setQuantity('1')
    if (!ticket) setPrice('')
    setErrors({})
  }
  const credentials = (
    <>
      <Field
        id="purchase-number"
        label={t('tickets.numberRequired')}
        hint={t('tickets.numberProgress', { value1: number.length })}
        error={errors.number}
      >
        <input
          ref={numberInput}
          id="purchase-number"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          value={number}
          onChange={(event) => setNumber(event.target.value.replace(/\D/g, ''))}
          placeholder="0123456789"
          aria-invalid={!!errors.number}
          aria-describedby={errors.number ? 'purchase-number-error' : undefined}
        />
      </Field>
      <Field
        id="ticket-pin"
        label={t('tickets.pinRequired')}
        hint={t('tickets.pinProgress', { value1: pin.length })}
        error={errors.pin}
      >
        <input
          id="ticket-pin"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
          placeholder="1234"
          aria-invalid={!!errors.pin}
          aria-describedby={errors.pin ? 'ticket-pin-error' : undefined}
        />
      </Field>
    </>
  )
  return (
    <>
      <Header title={ticket ? t('tickets.edit') : t('tickets.add')} back={back} />
      <main className="page form-page ticket-form-page">
        <div className="target-movie">
          <Film size={16} />
          <span>{t('tickets.movie')}</span>
          <strong>{movie.title}</strong>
          {!ticket && (
            <button
              className="text-button primary-text"
              onClick={() => setSwitching(true)}
            >{t('common.switch')}</button>
          )}
        </div>
        {!ticket && (
          <div className="segmented" aria-label={t('tickets.entryMethod')}>
            {(['single', 'batch', 'photo'] as const).map((item, index) => (
              <button
                key={item}
                aria-pressed={mode === item}
                className={mode === item ? 'selected' : ''}
                disabled={submitting}
                onClick={() => {
                  if (item === mode) return
                  if (mode === 'photo' || item === 'photo') { setNumber(''); setPin(''); setOcrReady(false) }
                  setMode(item)
                  setErrors({})
                  if (item === 'photo') changeType('physical')
                }}
              >
                {[t('tickets.single'), t('tickets.batch'), t('ocr.scan')][index]}
              </button>
            ))}
          </div>
        )}
        <form
          id="ticket-form"
          className="form-stack"
          noValidate
          onSubmit={submit}
        >
          {mode !== 'photo' ? (
            <fieldset>
              <legend>{t('tickets.type')}</legend>
              <div className="type-choices">
                {(['physical', 'digital'] as const).map((item) => (
                  <label
                    key={item}
                    className={`type-choice ${type === item ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="voucher-type"
                      checked={type === item}
                      onChange={() => changeType(item)}
                    />
                    <div>
                      <strong>{t(typeLabels[item])}</strong>
                      {type === item && <CircleCheck size={18} />}
                    </div>
                    <span>
                      {item === 'physical'
                        ? t('tickets.physicalHelp')
                        : t('tickets.digitalHelp')}
                    </span>
                  </label>
                ))}
              </div>
              {activeType === 'physical' && errors.quantity && (
                <p className="field-error" role="alert">
                  {translateMessage(errors.quantity)}
                </p>
              )}
            </fieldset>
          ) : (
            <div className="notice">
              <Info size={16} />
              <span>{t('ocr.physicalOnly')}</span>
            </div>
          )}
          {mode === 'photo' && <OcrScanner
            number={number} pin={pin} onNumber={setNumber} onPin={setPin}
            onReady={setOcrReady} resetToken={scanReset} disabled={submitting} errors={errors}
          />}
          {mode === 'photo' && errors.photo && <p className="field-error" role="alert">{translateMessage(errors.photo)}</p>}
          {mode === 'single' ? credentials : null}
          {mode !== 'batch' && duplicate && (
            <p className="notice pending-text" role="status">{t('tickets.duplicateWarning')}</p>
          )}
          {mode === 'batch' && (
            <>
              <Field
                id="batch-text"
                label={t('tickets.batchText')}
                hint={t('tickets.batchHint')}
                error={errors.batch}
              >
                <textarea
                  id="batch-text"
                  rows={5}
                  placeholder={'0123456789 1234\n1234567890 5678'}
                  value={batch}
                  onChange={(event) => {
                    setBatch(event.target.value)
                    setRows(null)
                    setErrors({})
                  }}
                  aria-invalid={!!errors.batch}
                  aria-describedby={
                    errors.batch ? 'batch-text-error' : undefined
                  }
                />
                <p className="hint">{t('tickets.batchSeparator')}</p>
              </Field>
              {rows && (
                <section className="batch-preview">
                  <div className="field-label">
                    <h2>{t('tickets.batchReview')}</h2>
                    <button
                      type="button"
                      className="text-button primary-text"
                      onClick={parseBatch}
                    >
                      <RefreshCw size={14} />{t('tickets.reparse')}</button>
                  </div>
                  <div className="batch-summary">
                    <Badge status="available">{t('tickets.validRows', { count: validRows.length })}</Badge>
                    {rows.length > validRows.length && (
                      <Badge status="pending">{t('tickets.invalidRows', { count: rows.length - validRows.length })}</Badge>
                    )}
                    {!!duplicateRows && <Badge status="pending">{t('tickets.duplicateRows', { count: duplicateRows })}</Badge>}
                  </div>
                  {checkedRows.map((row) => (
                    <div
                      key={row.line}
                      className={`batch-row ${row.error ? 'invalid' : ''}`}
                    >
                      <span className="hint">{t('tickets.line', { value1: row.line })}</span>
                      <div className="batch-fields">
                        <Field id={`batch-number-${row.line}`} label={t('tickets.number')}>
                          <input id={`batch-number-${row.line}`} inputMode="numeric" maxLength={10}
                            value={row.number} onChange={(event) => updateRow(row.line, { number: event.target.value.replace(/\D/g, '') })} />
                        </Field>
                        <Field id={`batch-pin-${row.line}`} label={t('tickets.pin')}>
                          <input id={`batch-pin-${row.line}`} inputMode="numeric" maxLength={4}
                            value={row.pin} onChange={(event) => updateRow(row.line, { pin: event.target.value.replace(/\D/g, '') })} />
                        </Field>
                        {activeType === 'digital' && (
                          <Field id={`batch-quantity-${row.line}`} label={t('tickets.quantity')}>
                            <input id={`batch-quantity-${row.line}`} type="number" inputMode="numeric" min="1" step="1"
                              value={row.quantity || quantity} onChange={(event) => updateRow(row.line, { quantity: event.target.value })} />
                          </Field>
                        )}
                        <Field id={`batch-price-${row.line}`} label={t('tickets.totalPrice')}>
                          <input id={`batch-price-${row.line}`} type="number" inputMode="numeric" min="0" step="1"
                            value={row.price || price || (Number.isFinite(row.amount) ? String(row.amount) : '')}
                            onChange={(event) => updateRow(row.line, { price: event.target.value })} />
                        </Field>
                        {row.error && (
                          <p className="field-error" role="alert">{translateMessage(row.error)}</p>
                        )}
                        {row.duplicate && <p className="pending-text">{t('tickets.duplicateRow')}</p>}
                      </div>
                      {!row.error && (
                        <CircleCheck size={18} className="available-text" />
                      )}
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
          {activeType === 'digital' && (
            <Field
              id="ticket-quantity"
              label={t('tickets.quantity')}
              hint={t('tickets.perDigitalTicket')}
              error={errors.quantity}
            >
              <input
                id="ticket-quantity"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={quantity}
                onChange={(event) => {
                  setQuantity(event.target.value)
                }}
                aria-invalid={!!errors.quantity}
                aria-describedby={
                  errors.quantity ? 'ticket-quantity-error' : undefined
                }
              />
              {ticket && (
                <p className="hint">{t('tickets.quantityHelp', { value1: ticket.counts.pending, value2: ticket.counts.used })}</p>
              )}
            </Field>
          )}
          {(mode !== 'photo' || ocrReady) && (
            <Field
              id="ticket-price"
              label={
                activeType === 'digital' ? t('tickets.digitalPrice') : t('tickets.price')
              }
              hint={activeType === 'physical' ? t('tickets.singleRedemption') : t('common.yen')}
              error={errors.price}
            >
              <div className="money-input">
                <span>¥</span>
                <input
                  id="ticket-price"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={price || String(defaultPrice)}
                  onChange={(event) => setPrice(event.target.value)}
                  aria-invalid={!!errors.price}
                  aria-describedby={
                    errors.price ? 'ticket-price-error' : undefined
                  }
                />
              </div>
              <p className="hint">{t('tickets.defaultPrice', { value1: yen(movie.price) })}</p>
            </Field>
          )}
          {(mode === 'single' || mode === 'photo') && (
            <div className="entry-options">
              {!ticket && (
                <>
                  <label className="switch-row">
                    <div>
                      <strong>{t('tickets.continuous')}</strong>
                      <span>{t('tickets.continuousHelp')}</span>
                    </div>
                    <input
                      className="switch-input"
                      type="checkbox"
                      role="switch"
                      checked={continuous}
                      onChange={(event) => setContinuous(event.target.checked)}
                    />
                    <span className="switch-track" aria-hidden="true" />
                  </label>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setShowNote(!showNote)}
                    aria-expanded={showNote}
                  >
                    <Plus size={16} />{t('tickets.addNote')}</button>
                </>
              )}
              {showNote && (
                <Field id="ticket-note" label={t('tickets.note')}>
                  <input
                    id="ticket-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder={t('tickets.notePlaceholder')}
                    maxLength={200}
                  />
                </Field>
              )}
            </div>
          )}
          {ticket && (
            <button
              className="text-button danger-text delete-movie"
              type="button"
              onClick={() => setDeleting(true)}
            >
              <Trash2 size={18} />{t('tickets.delete')}</button>
          )}
        </form>
      </main>
      <div className="bottom-bar">
        <button className="button secondary" onClick={back}>{t('common.cancel')}</button>
        <button
          className="button primary grow"
          form="ticket-form"
          type="submit"
          disabled={submitting || (mode === 'photo' && !ocrReady)}
        >
          {ticket
            ? t('common.saveChanges')
            : mode === 'batch'
              ? rows
                ? t('tickets.saveValid', { count: validRows.length })
                : t('tickets.parsePreview')
              : mode === 'photo'
                ? t('tickets.confirmSave')
                : continuous
                  ? t('tickets.saveContinue')
                  : t('tickets.save')}
        </button>
      </div>
      {deleting && ticket && (
        <Sheet
          title={t('tickets.delete')}
          description={t('tickets.deleteConfirm', { value1: ticket.number })}
          onClose={() => setDeleting(false)}
        >
          <div className="sheet-footer">
            <button
              className="button secondary"
              onClick={() => setDeleting(false)}
            >{t('common.cancel')}</button>
            <button
              className="button danger"
              onClick={async () => {
                if (await save({
                  ...library,
                  tickets: library.tickets.filter(
                    (item) => item.id !== ticket.id,
                  ),
                })) {
                  notify('tickets.deleted')
                  back()
                }
              }}
            >{t('common.confirmDelete')}</button>
          </div>
        </Sheet>
      )}
      {switching && (
        <Sheet title={t('tickets.chooseMovie')} onClose={() => setSwitching(false)}>
          <div className="sheet-body movie-options">
            {library.movies.map((item) => (
              <button
                key={item.id}
                className="movie-option"
                disabled={submitting}
                onClick={() => {
                  setSwitching(false)
                  navigate(`/movies/${item.id}/add`)
                }}
              >
                <Film size={18} />
                <span>{item.title}</span>
                {item.id === movie.id && <Check size={18} />}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}

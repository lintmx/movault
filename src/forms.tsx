import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  Camera,
  Check,
  CircleCheck,
  FileImage,
  Film,
  ImagePlus,
  Info,
  Plus,
  RefreshCw,
  ScanLine,
  Trash2,
} from 'lucide-react'
import {
  navigate,
  credentialKey,
  readImage,
  totals,
  timestamp,
  typeLabels,
  yen,
  type Library,
  type Movie,
  type Ticket,
  type TicketType,
} from './data'
import { Badge, Field, Header, Poster, Sheet } from './ui'

type FormProps = {
  library: Library
  save: (library: Library) => Promise<boolean>
  notify: (message: string) => void
}

export function MovieForm({
  movie,
  library,
  save,
  notify,
}: FormProps & { movie?: Movie }) {
  const [title, setTitle] = useState(movie?.title ?? '')
  const [date, setDate] = useState(movie?.releaseDate ?? '')
  const [price, setPrice] = useState(String(movie?.price ?? 1500))
  const [poster, setPoster] = useState(movie?.poster ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [deleting, setDeleting] = useState(false)
  const upload = useRef<HTMLInputElement>(null)
  const back = () => navigate(movie ? `/movies/${movie.id}` : '/')
  const count = library.tickets.filter(
    (ticket) => ticket.movieId === movie?.id,
  ).length
  async function submit(event: FormEvent) {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    if (!title.trim()) nextErrors.title = '请输入电影名称'
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      nextErrors.date = '请选择上映日期'
    if (!price || !Number.isFinite(Number(price)) || Number(price) < 0)
      nextErrors.price = '请输入有效的日元价格'
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
      notify('电影已保存')
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
      <Header title={movie ? '编辑电影' : '新建电影'} back={back} />
      <main className="page form-page">
        <form
          id="movie-form"
          className="form-stack"
          noValidate
          onSubmit={submit}
        >
          <section className="poster-editor">
            <div className="field-label">
              <span>电影海报</span>
              <span>选填</span>
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
                <h2>上传电影海报</h2>
                <p className="hint">
                  支持 JPG、PNG、WebP
                  <br />
                  建议使用 2:3 竖版图片
                </p>
                <div className="poster-actions">
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => upload.current?.click()}
                  >
                    <ImagePlus size={16} />
                    {poster ? '更换海报' : '选择图片'}
                  </button>
                  {poster && (
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="移除海报"
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
            label="电影名称 *"
            hint="支持日文原名或译名"
            error={errors.title}
          >
            <input
              id="movie-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="输入电影名称"
              maxLength={160}
              required
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? 'movie-title-error' : undefined}
            />
          </Field>
          <Field
            id="movie-date"
            label="上映日期 *"
            hint="日本院线上映日"
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
            label="默认单次价格 *"
            hint="日元"
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
            <p className="hint">录入前售券时自动带入，可单独修改。</p>
          </Field>
          {movie && (
            <button
              className="text-button danger-text delete-movie"
              type="button"
              onClick={() => setDeleting(true)}
            >
              <Trash2 size={18} />
              删除电影
            </button>
          )}
        </form>
      </main>
      <div className="bottom-bar">
        <button className="button secondary" onClick={back}>
          取消
        </button>
        <button form="movie-form" className="button primary grow" type="submit">
          <Check size={18} />
          保存电影
        </button>
      </div>
      {deleting && movie && (
        <Sheet
          title="删除电影"
          description={`将删除「${movie.title}」及其 ${count} 张前售券，此操作无法撤销。`}
          onClose={() => setDeleting(false)}
        >
          <div className="sheet-footer">
            <button
              className="button secondary"
              onClick={() => setDeleting(false)}
            >
              取消
            </button>
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
                  notify('电影已删除')
                  navigate('/')
                }
              }}
            >
              确认删除
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}

function validateCode(value: string, code: string) {
  if (!/^\d{10}$/.test(value)) return '購入番号应为 10 位数字'
  if (!/^\d{4}$/.test(code)) return '暗証番号应为 4 位数字'
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
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [batch, setBatch] = useState('')
  const [rows, setRows] = useState<BatchRow[] | null>(null)
  const [photo, setPhoto] = useState('')
  const [switching, setSwitching] = useState(false)
  const camera = useRef<HTMLInputElement>(null)
  const album = useRef<HTMLInputElement>(null)
  const numberInput = useRef<HTMLInputElement>(null)
  const back = () => navigate(`/movies/${movie.id}`)
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
      (!Number.isSafeInteger(total) || total < 1 ? '兑换总次数至少为 1 次' : '') ||
      (!Number.isFinite(amount) || amount < 0 ? '请输入有效的日元价格' : '')
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
          parseError: values.length !== 2 ? '每行应包含一组購入番号和暗証番号' : '',
        }
      })
    setRows(nextRows)
    if (!nextRows.length) setErrors({ batch: '请先粘贴前售券号码' })
    else setErrors({})
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (mode === 'batch' && !rows) {
      parseBatch()
      return
    }
    const now = timestamp()
    const nextErrors: Record<string, string> = {}
    if (mode !== 'batch' && (!Number.isFinite(effectivePrice) || effectivePrice < 0))
      nextErrors.price = '请输入有效的日元价格'
    if (
      mode !== 'batch' && activeType === 'digital' &&
      (!Number.isSafeInteger(Number(quantity)) || Number(quantity) < 1)
    )
      nextErrors.quantity = '兑换总次数至少为 1 次'
    const pending = ticket?.counts.pending ?? 0
    const used = ticket?.counts.used ?? 0
    if (ticket && total < pending + used)
      nextErrors.quantity = `总次数不能少于待确认和已使用的 ${pending + used} 次，请先更改状态`
    if (mode !== 'batch') {
      if (!/^\d{10}$/.test(number)) nextErrors.number = '購入番号应为 10 位数字'
      if (!/^\d{4}$/.test(pin)) nextErrors.pin = '暗証番号应为 4 位数字'
      if (mode === 'photo' && !photo)
        nextErrors.photo = '请先拍照或选择券面图片'
    } else if (!validRows.length)
      nextErrors.batch = '没有可以保存的有效记录，请修正下方错误'
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
    if (
      !(await save({
        ...library,
        tickets: ticket
          ? library.tickets.map((item) =>
              item.id === ticket.id ? added[0] : item,
            )
          : [...library.tickets, ...added],
      }))
    ) return
    notify(ticket ? '前售券已更新' : `已保存 ${added.length} 张前售券`)
    if (mode === 'single' && continuous) {
      setNumber('')
      setPin('')
      numberInput.current?.focus()
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
  async function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) {
      try {
        setPhoto(await readImage(file))
        setNumber('')
        setPin('')
        setErrors({})
      } catch (error) {
        notify((error as Error).message)
      }
    }
    event.target.value = ''
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
        label="購入番号 *"
        hint={`${number.length} / 10 位`}
        error={errors.number}
      >
        {mode === 'photo' && photo && (
          <div className="scan-preview">
            <img src={photo} alt="券面原图，请核对購入番号" />
            <span>券面原图</span>
          </div>
        )}
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
        label="暗証番号 *"
        hint={`${pin.length} / 4 位`}
        error={errors.pin}
      >
        {mode === 'photo' && photo && (
          <div className="scan-preview">
            <img src={photo} alt="券面原图，请核对暗証番号" />
            <span>券面原图</span>
          </div>
        )}
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
      <Header title={ticket ? '编辑前售券' : '添加前售券'} back={back} />
      <main className="page form-page ticket-form-page">
        <div className="target-movie">
          <Film size={16} />
          <span>录入电影</span>
          <strong>{movie.title}</strong>
          {!ticket && (
            <button
              className="text-button primary-text"
              onClick={() => setSwitching(true)}
            >
              切换
            </button>
          )}
        </div>
        {!ticket && (
          <div className="segmented" aria-label="录入方式">
            {(['single', 'batch', 'photo'] as const).map((item, index) => (
              <button
                key={item}
                aria-pressed={mode === item}
                className={mode === item ? 'selected' : ''}
                onClick={() => {
                  setMode(item)
                  setErrors({})
                  if (item === 'photo') changeType('physical')
                }}
              >
                {['单张录入', '批量粘贴', '拍照识别'][index]}
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
              <legend>前售券类型</legend>
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
                      <strong>{typeLabels[item]}</strong>
                      {type === item && <CircleCheck size={18} />}
                    </div>
                    <span>
                      {item === 'physical'
                        ? '单次兑换，纸质或卡片'
                        : '支持多次兑换，邮件或网页'}
                    </span>
                  </label>
                ))}
              </div>
              {activeType === 'physical' && errors.quantity && (
                <p className="field-error" role="alert">
                  {errors.quantity}
                </p>
              )}
            </fieldset>
          ) : (
            <div className="notice">
              <Info size={16} />
              <span>拍照识别仅适用于实体券，每张兑换 1 次。</span>
            </div>
          )}
          {mode === 'photo' && (
            <>
              <div className="photo-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => camera.current?.click()}
                >
                  <Camera size={20} />
                  {photo ? '重新拍照' : '直接拍照'}
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => album.current?.click()}
                >
                  <FileImage size={20} />
                  从相册选择
                </button>
              </div>
              <input
                hidden
                ref={camera}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={pickPhoto}
              />
              <input
                hidden
                ref={album}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={pickPhoto}
              />
              {photo ? (
                <div className="notice">
                  <Info size={16} />
                  <span>
                    自动识别尚未接入。请对照原图填写号码，确认后保存。
                  </span>
                </div>
              ) : (
                <>
                  <p className="hint">
                    请刮开涂层并平整放置，确保購入番号与暗証番号清晰、无反光。
                  </p>
                  <div className="scan-empty">
                    <ScanLine size={32} />
                    <h2>尚未拍摄或上传券面照片</h2>
                    <p>选择拍照或从相册选取后，核对并填写凭证。</p>
                  </div>
                  {errors.photo && (
                    <p className="field-error" role="alert">
                      {errors.photo}
                    </p>
                  )}
                </>
              )}
            </>
          )}
          {mode === 'single' || (mode === 'photo' && photo)
            ? credentials
            : null}
          {mode !== 'batch' && duplicate && (
            <p className="notice pending-text" role="status">
              此电影下已有相同的購入番号与暗証番号，请确认是否重复录入。
            </p>
          )}
          {mode === 'batch' && (
            <>
              <Field
                id="batch-text"
                label="原始文本"
                hint="每行一张券"
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
                <p className="hint">
                  購入番号和暗証番号之间用空格、逗号或 Tab 分隔。
                </p>
              </Field>
              {rows && (
                <section className="batch-preview">
                  <div className="field-label">
                    <h2>核对凭证数据</h2>
                    <button
                      type="button"
                      className="text-button primary-text"
                      onClick={parseBatch}
                    >
                      <RefreshCw size={14} />
                      重新解析
                    </button>
                  </div>
                  <div className="batch-summary">
                    <Badge status="available">有效 {validRows.length} 条</Badge>
                    {rows.length > validRows.length && (
                      <Badge status="pending">
                        异常 {rows.length - validRows.length} 条
                      </Badge>
                    )}
                    {!!duplicateRows && <Badge status="pending">疑似重复 {duplicateRows} 条</Badge>}
                  </div>
                  {checkedRows.map((row) => (
                    <div
                      key={row.line}
                      className={`batch-row ${row.error ? 'invalid' : ''}`}
                    >
                      <span className="hint">第 {row.line} 行</span>
                      <div className="batch-fields">
                        <Field id={`batch-number-${row.line}`} label="購入番号">
                          <input id={`batch-number-${row.line}`} inputMode="numeric" maxLength={10}
                            value={row.number} onChange={(event) => updateRow(row.line, { number: event.target.value.replace(/\D/g, '') })} />
                        </Field>
                        <Field id={`batch-pin-${row.line}`} label="暗証番号">
                          <input id={`batch-pin-${row.line}`} inputMode="numeric" maxLength={4}
                            value={row.pin} onChange={(event) => updateRow(row.line, { pin: event.target.value.replace(/\D/g, '') })} />
                        </Field>
                        {activeType === 'digital' && (
                          <Field id={`batch-quantity-${row.line}`} label="兑换总次数">
                            <input id={`batch-quantity-${row.line}`} type="number" inputMode="numeric" min="1" step="1"
                              value={row.quantity || quantity} onChange={(event) => updateRow(row.line, { quantity: event.target.value })} />
                          </Field>
                        )}
                        <Field id={`batch-price-${row.line}`} label="总价（日元）">
                          <input id={`batch-price-${row.line}`} type="number" inputMode="numeric" min="0" step="1"
                            value={row.price || price || (Number.isFinite(row.amount) ? String(row.amount) : '')}
                            onChange={(event) => updateRow(row.line, { price: event.target.value })} />
                        </Field>
                        {row.error && (
                          <p className="field-error" role="alert">{row.error}</p>
                        )}
                        {row.duplicate && <p className="pending-text">号码组合疑似重复，请核对</p>}
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
              label="兑换总次数"
              hint="每张电子券"
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
                <p className="hint">
                  待确认 {ticket.counts.pending} 次，已使用 {ticket.counts.used} 次。
                  调整总次数只增减未使用数量。
                </p>
              )}
            </Field>
          )}
          {(mode !== 'photo' || photo) && (
            <Field
              id="ticket-price"
              label={
                activeType === 'digital' ? '整张电子券总价' : '价格（日元）'
              }
              hint={activeType === 'physical' ? '固定兑换 1 次' : '日元'}
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
              <p className="hint">
                电影默认单次价格 {yen(movie.price)}，可直接修改。
              </p>
            </Field>
          )}
          {mode === 'single' && (
            <div className="entry-options">
              {!ticket && (
                <>
                  <label className="switch-row">
                    <div>
                      <strong>连续录入</strong>
                      <span>保存后清空号码，保留类型与共同设置</span>
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
                    <Plus size={16} />
                    添加备注（选填）
                  </button>
                </>
              )}
              {showNote && (
                <Field id="ticket-note" label="备注">
                  <input
                    id="ticket-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="特典名称、购买批次等"
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
              <Trash2 size={18} />
              删除前售券
            </button>
          )}
        </form>
      </main>
      <div className="bottom-bar">
        <button className="button secondary" onClick={back}>
          取消
        </button>
        <button
          className="button primary grow"
          form="ticket-form"
          type="submit"
          disabled={mode === 'photo' && !photo}
        >
          {ticket
            ? '保存修改'
            : mode === 'batch'
              ? rows
                ? `保存有效的 ${validRows.length} 张`
                : '解析并预览'
              : mode === 'photo'
                ? '确认并保存'
                : continuous
                  ? '保存并继续添加'
                  : '保存前售券'}
        </button>
      </div>
      {deleting && ticket && (
        <Sheet
          title="删除前售券"
          description={`将删除購入番号 ${ticket.number} 的前售券及其全部兑换数量、价格和备注，此操作无法撤销。`}
          onClose={() => setDeleting(false)}
        >
          <div className="sheet-footer">
            <button
              className="button secondary"
              onClick={() => setDeleting(false)}
            >
              取消
            </button>
            <button
              className="button danger"
              onClick={async () => {
                if (await save({
                  ...library,
                  tickets: library.tickets.filter(
                    (item) => item.id !== ticket.id,
                  ),
                })) {
                  notify('前售券已删除')
                  back()
                }
              }}
            >
              确认删除
            </button>
          </div>
        </Sheet>
      )}
      {switching && (
        <Sheet title="选择录入电影" onClose={() => setSwitching(false)}>
          <div className="sheet-body movie-options">
            {library.movies.map((item) => (
              <button
                key={item.id}
                className="movie-option"
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

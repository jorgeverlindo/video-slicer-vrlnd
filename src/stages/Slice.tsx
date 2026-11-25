import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Video, Pin, Close, Subtract, Add, Microphone, CheckmarkFilled } from '@carbon/icons-react'
import Player from '../components/Player'
import Filmstrip, { useThumbs, type Marker } from '../components/Filmstrip'
import { Segmented, Toggle, Setting, Progress, Spinner, RadioCard, Select } from '../ui/primitives'
import { useTween } from '../hooks/motion'
import type { ExtractionParams, AspectRatio, Frame } from '../lib/extractor'
import { buildTimestamps, fmtTimecode } from '../lib/extractor'
import type { TranscriptLang, TranscriptStatus, TranscriptResult } from '../lib/transcript-types'
import { LANGUAGES } from '../lib/languages'
import type { MarkedFrame } from '../App'

type Mode = ExtractionParams['mode']

export type Transcript = {
  enabled: boolean
  lang: TranscriptLang
  status: TranscriptStatus
  msg: string
  progress: number | null
  result: TranscriptResult | null
}

type Props = {
  file: File
  duration: number
  videoMode: 'native' | 'ffmpeg'
  converterMsg: string | null
  videoRef: React.RefObject<HTMLVideoElement>
  params: ExtractionParams
  onParams: (p: ExtractionParams) => void
  aspectRatio: AspectRatio
  onAspectRatio: (r: AspectRatio) => void
  marked: MarkedFrame[]
  onMark: (t: number, thumb: string) => void
  onUnmark: (id: number) => void
  transcript: Transcript
  onTranscribe: (on: boolean) => void
  onLang: (l: TranscriptLang) => void
  onReplace: () => void
  onExtract: () => void
  extracting: boolean
  progress: { done: number; total: number; kept?: number; startedAt: number } | null
  frames: Frame[]
  onCancel: () => void
  error: string | null
}

const PRESETS: { value: Mode; title: string; desc: string }[] = [
  { value: 'interval', title: 'Interval', desc: 'Every few seconds' },
  { value: 'count', title: 'Fixed count', desc: 'Spread evenly' },
  { value: 'custom', title: 'Custom', desc: 'Moments you pick' },
  { value: 'storyboard', title: 'Storyboard', desc: 'One per spoken line' },
]

const QUALITY: { value: string; label: string; q: number }[] = [
  { value: 'draft', label: 'Draft', q: 0.6 },
  { value: 'good', label: 'Good', q: 0.75 },
  { value: 'high', label: 'High', q: 0.85 },
  { value: 'max', label: 'Max', q: 0.95 },
]
const qualityKey = (q: number) => QUALITY.reduce((b, o) => (Math.abs(o.q - q) < Math.abs(b.q - q) ? o : b)).value

const RATIOS: AspectRatio[] = ['16:9', '1:1', '4:5', '9:16']

function fmtBytes(b: number): string {
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

/** Real per-frame size: encodes the current frame at the chosen quality. */
function useFrameBytes(videoRef: React.RefObject<HTMLVideoElement>, quality: number, enabled: boolean) {
  const [bytes, setBytes] = useState<number | null>(null)
  useEffect(() => {
    const v = videoRef.current
    if (!v || !enabled) { setBytes(null); return }
    let alive = true
    const measure = () => {
      if (!v.videoWidth) return
      const c = document.createElement('canvas')
      c.width = v.videoWidth; c.height = v.videoHeight
      c.getContext('2d')!.drawImage(v, 0, 0)
      c.toBlob((b) => { if (alive && b) setBytes(b.size) }, 'image/jpeg', quality)
    }
    if (v.readyState >= 2) measure()
    v.addEventListener('loadeddata', measure)
    return () => { alive = false; v.removeEventListener('loadeddata', measure) }
  }, [videoRef, quality, enabled])
  return bytes
}

export default function Slice(p: Props) {
  const native = p.videoMode === 'native' && p.duration > 0
  const ready = p.duration > 0
  const thumbs = useThumbs(native ? p.file : null, p.duration)
  const frameBytes = useFrameBytes(p.videoRef, p.params.quality, native)

  const markers = useMemo<Marker[]>(() => {
    if (!ready) return []
    const { mode } = p.params
    if (mode === 'interval' || mode === 'count') return buildTimestamps(p.duration, p.params).map((t) => ({ t, kind: 'tick' }))
    if (mode === 'storyboard' && p.transcript.status === 'done' && p.transcript.result?.chunks?.length) {
      return p.transcript.result.chunks.map((c, i) => ({ t: c.timestamp[0], kind: 'pin', label: String(i + 1) }))
    }
    return p.marked.map((m, i) => ({ t: m.timestamp, kind: 'pin', label: String(i + 1) }))
  }, [ready, p.duration, p.params, p.marked, p.transcript.status, p.transcript.result])

  const marking = native && !p.extracting &&
    (p.params.mode === 'custom' || (p.params.mode === 'storyboard' && p.transcript.status !== 'done'))

  // ── Mark this frame ──
  const mark = useCallback(() => {
    const v = p.videoRef.current
    if (!v || !isFinite(v.currentTime)) return
    const c = document.createElement('canvas')
    const s = Math.min(1, 320 / (v.videoWidth || 320))
    c.width = Math.round((v.videoWidth || 320) * s)
    c.height = Math.round((v.videoHeight || 180) * s)
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height)
    p.onMark(v.currentTime, c.toDataURL('image/jpeg', 0.7))
  }, [p])

  const markRef = useRef(mark); markRef.current = mark
  const canMarkRef = useRef(false); canMarkRef.current = marking
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!canMarkRef.current || !e.altKey || e.code !== 'KeyD') return // e.code: ⌥D types ∂ on Mac
      const t = e.target as HTMLElement
      if (t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type !== 'range')) return
      e.preventDefault()
      markRef.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  return (
    <div className="slice">
      <div className="slice__media">
        <div className="file-row">
          <Video size={16} aria-hidden="true" />
          <span className="t-label-m file-row__name" title={p.file.name}>{p.file.name}</span>
          <button type="button" className="btn btn--ghost" onClick={p.onReplace} disabled={p.extracting}>Replace video</button>
        </div>

        {native ? (
          <Player
            file={p.file} videoRef={p.videoRef} duration={p.duration}
            overlay={marking && (
              <button type="button" className="mark-btn" onClick={mark}>
                <Pin size={16} /> <span className="t-label-m">Mark this frame</span>
                <kbd className="t-mono-s">⌥D</kbd>
              </button>
            )}
          />
        ) : (
          <ConverterState msg={p.converterMsg} ready={ready} />
        )}

        {native && <Filmstrip duration={p.duration} thumbs={thumbs} videoRef={p.videoRef} markers={markers} disabled={p.extracting} />}
      </div>

      <aside className="panel" aria-label={p.extracting ? 'Slicing progress' : 'Slice settings'}>
        {p.extracting && p.progress
          ? <ProcessingPanel {...p} />
          : <SettingsPanel {...p} native={native} ready={ready} frameBytes={frameBytes} />}
      </aside>
    </div>
  )
}

// ── S4b: converter mode ─────────────────────────────────────────────────────
function ConverterState({ msg, ready }: { msg: string | null; ready: boolean }) {
  return (
    <div className="converter" role="status">
      {ready ? (
        <>
          <span className="converter__ring"><Video size={24} /></span>
          <h2 className="t-title-s">Ready to slice</h2>
          <p className="t-body-m c-subtle converter__body">Preview is off for this file. Frames still come out at full quality.</p>
        </>
      ) : (
        <>
          <span className="converter__ring"><Spinner large /></span>
          <h2 className="t-title-s">Getting this video ready</h2>
          <p className="t-body-m c-subtle converter__body">
            Your browser can't play this format, so we're loading a universal converter.
            It downloads once, about 30 MB, and stays on your device.
          </p>
          {msg && <p className="t-caption c-subtle">{msg}</p>}
        </>
      )}
    </div>
  )
}

// ── Settings panel (S2, S2b, S2c, S2d, S3) ──────────────────────────────────
function SettingsPanel(p: Props & { native: boolean; ready: boolean; frameBytes: number | null }) {
  const { params, onParams } = p
  const mode = params.mode
  const chunks = p.transcript.result?.chunks ?? []
  const storyFromTx = mode === 'storyboard' && p.transcript.status === 'done' && chunks.length > 0

  const total = !p.ready ? 0
    : mode === 'interval' || mode === 'count' ? buildTimestamps(p.duration, params).length
    : storyFromTx ? chunks.length
    : p.marked.length

  const cta = !p.ready ? 'Extract frames'
    : mode === 'storyboard' ? (total ? 'Generate storyboard' : 'Mark shots to begin')
    : mode === 'custom' && !total ? 'Mark frames first'
    : params.uniqueOnly ? `Extract unique frames`
    : `Extract ${total} frame${total === 1 ? '' : 's'}`

  const hint = !p.ready ? 'Available once the converter is ready'
    : mode === 'storyboard' && total ? `${total} shot${total === 1 ? '' : 's'}, ready to export as PDF`
    : params.uniqueOnly && total ? `Scans ${total} moments and keeps the ones that change`
    : p.frameBytes && total ? `About ${fmtBytes(p.frameBytes * total)} as a ZIP`
    : null

  const canExtract = p.ready && total > 0

  return (
    <div className="panel__body">
      <header className="panel__head">
        <h2 className="t-title-m">How should we slice it?</h2>
        <p className="t-caption c-subtle">Pick a rhythm. You can change it before extracting.</p>
      </header>

      <fieldset className="presets">
        <legend className="sr-only">Slicing mode</legend>
        {PRESETS.map((o) => (
          <RadioCard
            key={o.value} name="mode" value={o.value} title={o.title} desc={o.desc}
            checked={mode === o.value}
            disabled={o.value === 'custom' && !p.native}
            onChange={() => onParams({ ...params, mode: o.value })}
          />
        ))}
      </fieldset>
      {!p.native && <p className="t-caption c-subtle">Custom needs the preview to pick moments, so it is off for this file.</p>}

      <hr className="divider" />

      <div className="panel__rows">
        {mode === 'interval' && (
          <Setting label="One frame every" hint="Shorter gaps catch more motion">
            <Stepper value={params.interval} min={0.1} step={params.interval < 1 ? 0.1 : 0.5} unit="s"
              format={(v) => v.toFixed(1)} label="Seconds between frames"
              onChange={(v) => onParams({ ...params, interval: v })} />
          </Setting>
        )}
        {mode === 'count' && (
          <Setting label="Total frames" hint="Spread evenly across the video">
            <Stepper value={params.count} min={1} max={500} step={1} label="Total frames"
              format={(v) => String(Math.round(v))}
              onChange={(v) => onParams({ ...params, count: Math.round(v) })} />
          </Setting>
        )}
        {(mode === 'interval' || mode === 'count') && (
          <Setting label="Only unique frames" hint="Skips near-identical shots">
            <Toggle checked={params.uniqueOnly} onChange={(v) => onParams({ ...params, uniqueOnly: v })} label="Only unique frames" />
          </Setting>
        )}

        {storyFromTx && (
          <div className="alert alert--success" role="status">
            <CheckmarkFilled size={16} />
            <div className="alert__title">Transcript ready. One frame per spoken line, {chunks.length} in total.</div>
          </div>
        )}

        {(mode === 'custom' || (mode === 'storyboard' && !storyFromTx)) && (
          <MarkList marked={p.marked} onUnmark={p.onUnmark} storyboard={mode === 'storyboard'}
            transcribing={p.transcript.enabled && p.transcript.status !== 'idle' && p.transcript.status !== 'error'} />
        )}

        {mode === 'storyboard' && (
          <div className="field">
            <span className="field__label">Frame ratio</span>
            <Segmented label="Frame ratio" value={p.aspectRatio} onChange={p.onAspectRatio}
              options={RATIOS.map((r) => ({ value: r, label: r }))} />
            <span className="field__hint">Detected from the video. Change it to crop the shots.</span>
          </div>
        )}

        <div className="field">
          <span className="field__label">Image quality</span>
          <Segmented label="Image quality" value={qualityKey(params.quality)}
            onChange={(k) => onParams({ ...params, quality: QUALITY.find((o) => o.value === k)!.q })}
            options={QUALITY.map((o) => ({ value: o.value, label: o.label }))} />
          <span className="field__hint">{p.frameBytes ? `JPEG, about ${fmtBytes(p.frameBytes)} per frame` : 'JPEG'}</span>
        </div>

        <div className="field">
          {/* Figma S2: toggle leads, language sits at the end of the same row */}
          <div className="setting setting--lead">
            <Toggle checked={p.transcript.enabled} onChange={p.onTranscribe} label="Transcribe audio" />
            <div className="setting__text">
              <span className="setting__label">Transcribe audio</span>
              <span className="setting__hint">Runs on your device</span>
            </div>
            <Select label="Transcript language" value={p.transcript.lang} onChange={(v) => p.onLang(v as TranscriptLang)}
              disabled={!p.transcript.enabled} options={LANGUAGES} />
          </div>
          {p.transcript.enabled && <TranscriptStatusLine t={p.transcript} />}
        </div>
      </div>

      {p.error && <div className="alert alert--error" role="alert"><div className="alert__title">{p.error}</div></div>}

      <div className="panel__action">
        <button type="button" className="btn btn--primary btn--l btn--block" disabled={!canExtract} onClick={p.onExtract}>{cta}</button>
        {hint && <p className="t-caption c-subtle">{hint}</p>}
      </div>
    </div>
  )
}

function TranscriptStatusLine({ t }: { t: Transcript }) {
  if (t.status === 'idle' && t.lang === 'pt') return <p className="field__hint">Portuguese needs a one-time 460 MB download. After that it loads instantly.</p>
  if (t.status === 'done') return <p className="field__hint">Transcript ready, {t.result?.chunks?.length ?? 0} lines.</p>
  if (t.status === 'error') return <p className="field__error">{t.msg || "We couldn't transcribe this video."}</p>
  if (t.status === 'idle') return null
  const pct = t.progress
  return (
    <div className="tx-line" role="status">
      <Spinner />
      <span className="field__hint">{pct != null ? `Downloading the speech model, ${pct}%` : t.msg || 'Transcribing…'}</span>
    </div>
  )
}

// ── Stepper ──
function Stepper({ value, min, max = Infinity, step, onChange, format, unit, label }: {
  value: number; min: number; max?: number; step: number; onChange: (v: number) => void
  format: (v: number) => string; unit?: string; label: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 10) / 10))
  return (
    <div className="stepper">
      <button type="button" className="icon-btn" aria-label={`Less, ${label}`} disabled={value <= min} onClick={() => onChange(clamp(value - step))}><Subtract size={16} /></button>
      <input
        className="stepper__value" inputMode="decimal" aria-label={label}
        value={draft ?? `${format(value)}${unit ? ` ${unit}` : ''}`}
        onFocus={() => setDraft(format(value))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { const n = parseFloat(draft ?? ''); if (Number.isFinite(n)) onChange(clamp(n)); setDraft(null) }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
      <button type="button" className="icon-btn" aria-label={`More, ${label}`} disabled={value >= max} onClick={() => onChange(clamp(value + step))}><Add size={16} /></button>
    </div>
  )
}

// ── Marked moments (S3) ──
function MarkList({ marked, onUnmark, storyboard, transcribing }: {
  marked: MarkedFrame[]; onUnmark: (id: number) => void; storyboard: boolean; transcribing: boolean
}) {
  const list = useRef<HTMLOListElement>(null)
  useEffect(() => { const el = list.current; if (el) el.scrollTop = el.scrollHeight }, [marked.length])
  return (
    <div className="field">
      <div className="marks__head">
        <span className="field__label">{storyboard ? 'Shots' : 'Marked moments'}</span>
        {marked.length > 0 && <span className="chip-count">{marked.length}</span>}
      </div>
      {marked.length === 0 ? (
        <p className="marks__empty t-caption c-subtle">
          {storyboard
            ? transcribing ? 'Waiting for the transcript. You can also mark shots by hand.' : 'Turn on Transcribe audio for one shot per line, or mark shots by hand.'
            : 'Pause where you want a frame, then mark it.'}
        </p>
      ) : (
        <ol className="marks" ref={list}>
          {marked.map((m, i) => (
            <li key={m.id} className="mark">
              <img src={m.thumbnail} alt="" />
              <span className="mark__n t-label-s">{i + 1}</span>
              <span className="t-mono-m">{fmtTimecode(m.timestamp)}</span>
              <button type="button" className="icon-btn" onClick={() => onUnmark(m.id)} aria-label={`Remove mark ${i + 1}`}><Close size={16} /></button>
            </li>
          ))}
        </ol>
      )}
      {marked.length > 0 && <p className="t-caption c-subtle">Pause where you want a frame, then mark it.</p>}
    </div>
  )
}

// ── S4: processing ──────────────────────────────────────────────────────────
function ProcessingPanel(p: Props) {
  const prog = p.progress!
  const ratio = prog.total ? prog.done / prog.total : 0
  const shown = useTween(ratio * 100)
  const elapsed = (performance.now() - prog.startedAt) / 1000
  const left = prog.done > 0 ? Math.max(0, Math.round((elapsed / prog.done) * (prog.total - prog.done))) : null
  const recent = p.frames.slice(-4)
  const slots = 4
  const tx = p.transcript
  const txActive = tx.enabled && tx.status !== 'idle' && tx.status !== 'done' && tx.status !== 'error'

  const line = prog.kept != null
    ? `Scanned ${prog.done} of ${prog.total}, kept ${prog.kept}`
    : `Frame ${prog.done} of ${prog.total}`
  const eta = left == null ? '' : left === 0 ? ', almost done' : `, about ${left} second${left === 1 ? '' : 's'} left`

  return (
    <div className="panel__body">
      <header className="processing__head" aria-live="polite">
        <p className="t-label-m c-subtle">Slicing your video</p>
        <p className="t-display-l processing__pct" aria-hidden="true">{Math.round(shown)}%</p>
        <p className="t-body-m c-subtle">{line}{eta}.</p>
        <span className="sr-only">{Math.round(ratio * 100)} percent</span>
      </header>
      <Progress value={ratio} label="Slicing progress" />

      <div className="arrivals" aria-label="Latest frames">
        {Array.from({ length: slots }, (_, i) => {
          const f = recent[i]
          return f
            ? <img key={f.index} src={f.url} alt={`Frame ${f.index}`} className="arrivals__img" />
            : <span key={`e${i}`} className="arrivals__empty" />
        })}
      </div>

      {txActive && (
        <>
          <hr className="divider" />
          <div className="tx-card" role="status">
            <div className="tx-card__row">
              <Microphone size={16} />
              <span className="t-label-m">{tx.progress != null ? 'Preparing transcription' : 'Transcribing'}</span>
              {tx.progress != null && <span className="t-mono-s c-subtle tx-card__pct">{tx.progress}%</span>}
            </div>
            {tx.progress != null && <Progress value={tx.progress / 100} label="Speech model download" />}
            <p className="t-caption c-subtle">{tx.progress != null ? 'Downloading the speech model. Only the first time.' : tx.msg}</p>
          </div>
        </>
      )}

      <div className="panel__action">
        <button type="button" className="btn btn--secondary btn--l btn--block" onClick={p.onCancel}>Cancel</button>
      </div>
    </div>
  )
}

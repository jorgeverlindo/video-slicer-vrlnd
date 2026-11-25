import { useEffect, useRef, useState } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { Upload, Link, PlayOutline, Close, WarningFilled } from '@carbon/icons-react'
import HowItWorks from '../components/HowItWorks'
import { Toggle, Spinner, Select } from '../ui/primitives'
import type { TranscriptLang } from '../lib/transcript-types'
import { LANGUAGES } from '../lib/languages'
import { prefersReducedMotion } from '../hooks/motion'

const ACCEPT = { 'video/*': ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v'] }

type Props = {
  theme: 'light' | 'dark'
  onFile: (file: File) => void
  transcribe: boolean
  onTranscribe: (v: boolean) => void
  lang: TranscriptLang
  onLang: (l: TranscriptLang) => void
  onBusy: (busy: boolean) => void
}

export default function Home({ theme, onFile, transcribe, onTranscribe, lang, onLang, onBusy }: Props) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)

  const onDropRejected = (rejections: FileRejection[]) => {
    if (rejections.length > 1) setDropError('Drop one video at a time.')
    else setDropError(`${rejections[0]?.file.name ?? 'That file'} isn't a video we can open. Try an MP4, MOV, WebM or MKV.`)
  }

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: ACCEPT, multiple: false, noClick: true, noKeyboard: true,
    onDropAccepted: ([file]) => { setDropError(null); onFile(file) },
    onDropRejected,
  })

  return (
    <section
      {...getRootProps({ className: 'home', 'aria-label': 'Add a video' })}
      data-drag={isDragActive || undefined}
    >
      <input {...getInputProps()} />

      <div className="home__copy">
        <h1 className="t-display-xl home__title">
          <span className="enter" style={{ '--i': 0 } as React.CSSProperties}>Drop a video.</span>
          <span className="enter" style={{ '--i': 1 } as React.CSSProperties}>Keep every frame.</span>
        </h1>
        <p className="t-body-l c-subtle home__lede enter" style={{ '--i': 2 } as React.CSSProperties}>
          Pull stills, a transcript or a storyboard out of any clip, right in your browser.
          The file never leaves your machine.
        </p>

        <div className="enter" style={{ '--i': 3 } as React.CSSProperties}>
          {linkOpen
            ? <PasteLink onFile={onFile} onClose={() => setLinkOpen(false)} onBusy={onBusy} />
            : (
              <div className="home__actions">
                <button type="button" className="btn btn--primary btn--l" onClick={open}>
                  <Upload size={16} /> Choose a video
                </button>
                <button type="button" className="btn btn--secondary btn--l" onClick={() => setLinkOpen(true)}>
                  <Link size={16} /> Paste a link
                </button>
                <HowItWorks theme={theme} trigger={(show) => (
                  <button type="button" className="btn btn--link btn--l" onClick={show}>
                    <PlayOutline size={16} /> <span>See how it works</span>
                  </button>
                )} />
              </div>
            )}
          {dropError
            ? <p className="field__error home__note" role="alert"><WarningFilled size={14} />{dropError}</p>
            : !linkOpen && <p className="t-caption c-subtle home__note">Works with MP4, MOV, WebM and MKV</p>}
        </div>

        <div className="home__transcribe enter" style={{ '--i': 4 } as React.CSSProperties}>
          <Toggle checked={transcribe} onChange={onTranscribe} label="Also transcribe the audio" />
          <span className="t-label-m">Also transcribe the audio</span>
          <Select label="Transcript language" value={lang} onChange={(v) => onLang(v as TranscriptLang)} disabled={!transcribe}
            options={LANGUAGES} />
        </div>
      </div>

      <HeroStills theme={theme} />

      <div className="home__drop" aria-hidden={!isDragActive}>
        <Upload size={32} />
        <span className="t-title-m">Drop the video here</span>
      </div>
    </section>
  )
}

// ── Hero stills — three frames dealt onto the table ─────────────────────────
// Trajectory: one horse → two → three. Entrance: #004 lands, then #009 and
// #013 peel off its stack and slide down the diagonal, the way frames come
// out of the clip. Each card holds both theme renders; the theme attribute
// crossfades them (CSS), so a theme switch never waits on a fetch.
// Cards are draggable: pick one up and it lifts to the top of the pile,
// leans into the motion, and settles where it's thrown. Double-click sends
// a card back to its place.
const TRAJECTORY = [
  { n: '01', label: '#004', t: '00:00:04.0', cls: 'still--back' },
  { n: '02', label: '#009', t: '00:00:08.0', cls: 'still--top' },
  { n: '03', label: '#013', t: '00:00:13.0', cls: 'still--front' },
] as const

const SLACK = 32        // px a card may hang past the table edge
const LEAN_PER_VX = 6   // deg of lean per px/ms of horizontal speed
const LEAN_MAX = 6      // deg
const THROW_MS = 120    // release momentum: project velocity this far ahead

// Live hero (dark theme only; light and reduced motion keep the stills).
// Two variants, picked with ?hero=relay|loops while we compare:
//  · loops — each card loops its own ~1s moment (trajectory-0N.mp4)
//  · relay — one clip (trajectory-full.mp4) handed card to card: #004 plays
//    the first beat and freezes on it, #009 picks up from that exact frame,
//    then #013 runs to the end. Hold, then deal it again.
type HeroMode = 'relay' | 'loops'
const heroMode = (): HeroMode => (new URLSearchParams(location.search).get('hero') === 'loops' ? 'loops' : 'relay')
const RELAY = [0, 1.0, 2.5, 4.0]   // s: card i plays RELAY[i] → RELAY[i+1]
const RELAY_START_MS = 1100        // after the cards touch down (--lead + --dur-land)
const RELAY_HOLD_MS = 2600         // all three frozen before the next run

function useRelay(videos: React.MutableRefObject<(HTMLVideoElement | null)[]>, on: boolean) {
  useEffect(() => {
    if (!on) return
    const vs = videos.current
    let raf = 0, timer = 0, card = -1, alive = true
    const park = () => vs.forEach((v, i) => { if (v) { v.pause(); v.currentTime = RELAY[i] } })
    const step = () => {
      if (!alive) return
      const v = vs[card]
      if (v && v.currentTime >= RELAY[card + 1] - 0.02) {
        v.pause(); v.currentTime = Math.min(RELAY[card + 1] - 1 / 48, v.duration || Infinity) // freeze on its last beat
        card++
        if (card >= vs.length) { timer = window.setTimeout(run, RELAY_HOLD_MS); return }
        vs[card]?.play().catch(() => {})
      }
      raf = requestAnimationFrame(step)
    }
    const run = () => { park(); card = 0; vs[0]?.play().catch(() => {}); raf = requestAnimationFrame(step) }
    // Show each card's first frame while waiting, then start after the landing
    park()
    timer = window.setTimeout(run, RELAY_START_MS)
    return () => { alive = false; cancelAnimationFrame(raf); clearTimeout(timer); vs.forEach((v) => v?.pause()) }
  }, [videos, on])
}

type Drag = { i: number; sx: number; sy: number; ox: number; oy: number; lx: number; ly: number; lt: number; vx: number; vy: number }

function HeroStills({ theme }: { theme: 'light' | 'dark' }) {
  // Dark theme: each card loops its moment of the source clip (public/hero/
  // trajectory-0N.mp4, ~140 KB each, end crossfaded into start). The dark
  // still stays underneath as the poster. Light theme and reduced motion: stills.
  const live = theme === 'dark' && !prefersReducedMotion()
  const mode = heroMode()
  const videos = useRef<(HTMLVideoElement | null)[]>([])
  useRelay(videos, live && mode === 'relay')
  const box = useRef<HTMLDivElement>(null)
  const cards = useRef<(HTMLElement | null)[]>([])
  const pos = useRef(TRAJECTORY.map(() => ({ x: 0, y: 0 })))
  const drag = useRef<Drag | null>(null)
  const [stack, setStack] = useState<number[]>(TRAJECTORY.map((_, i) => i)) // last = on top

  const clampTo = (i: number, x: number, y: number) => {
    const el = cards.current[i], b = box.current
    if (!el || !b) return { x, y }
    const minX = -el.offsetLeft - SLACK, maxX = b.clientWidth - el.offsetLeft - el.offsetWidth + SLACK
    const minY = -el.offsetTop - SLACK, maxY = b.clientHeight - el.offsetTop - el.offsetHeight + SLACK
    return { x: Math.min(maxX, Math.max(minX, x)), y: Math.min(maxY, Math.max(minY, y)) }
  }
  const place = (i: number, x: number, y: number, lean = 0) => {
    const el = cards.current[i]
    if (!el) return
    pos.current[i] = { x, y }
    el.style.translate = `${x}px ${y}px`
    el.style.rotate = `${lean}deg`
  }

  const onDown = (i: number) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* pointer already gone */ }
    e.currentTarget.dataset.dragging = ''
    setStack((s) => [...s.filter((k) => k !== i), i])
    const { x, y } = pos.current[i]
    drag.current = { i, sx: e.clientX, sy: e.clientY, ox: x, oy: y, lx: e.clientX, ly: e.clientY, lt: e.timeStamp, vx: 0, vy: 0 }
  }
  const onMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d) return
    const dt = Math.max(1, e.timeStamp - d.lt)
    d.vx = d.vx * 0.7 + ((e.clientX - d.lx) / dt) * 0.3 // smoothed px/ms
    d.vy = d.vy * 0.7 + ((e.clientY - d.ly) / dt) * 0.3
    d.lx = e.clientX; d.ly = e.clientY; d.lt = e.timeStamp
    const { x, y } = clampTo(d.i, d.ox + e.clientX - d.sx, d.oy + e.clientY - d.sy)
    const lean = prefersReducedMotion() ? 0 : Math.max(-LEAN_MAX, Math.min(LEAN_MAX, d.vx * LEAN_PER_VX))
    place(d.i, x, y, lean)
  }
  const onUp = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d) return
    drag.current = null
    delete e.currentTarget.dataset.dragging // CSS transition carries the settle
    const throwMs = prefersReducedMotion() ? 0 : THROW_MS
    const { x, y } = clampTo(d.i, pos.current[d.i].x + d.vx * throwMs, pos.current[d.i].y + d.vy * throwMs)
    place(d.i, x, y, 0)
  }

  return (
    <div className="stills" ref={box} aria-hidden="true">
      {TRAJECTORY.map((c, i) => (
        <figure
          key={c.n} ref={(el) => { cards.current[i] = el }}
          className={`still ${c.cls}`}
          style={{ '--d': i, zIndex: stack.indexOf(i) + 1 } as React.CSSProperties}
          onPointerDown={onDown(i)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          onDoubleClick={() => place(i, 0, 0)}
        >
          <span className="still__media">
            <img className="still__img still__img--light" src={`/hero/trajectory-${c.n}-light.webp`} alt="" width={960} height={540} decoding="async" draggable={false} />
            <img className="still__img still__img--dark" src={`/hero/trajectory-${c.n}-dark.webp`} alt="" width={960} height={540} decoding="async" draggable={false} />
            {live && mode === 'loops' && (
              <video className="still__video" src={`/hero/trajectory-${c.n}.mp4`} width={960} height={540}
                muted loop autoPlay playsInline preload="auto" disablePictureInPicture
                onPlaying={(e) => { e.currentTarget.dataset.playing = '' }} />
            )}
            {live && mode === 'relay' && (
              <video className="still__video" ref={(el) => { videos.current[i] = el }} src="/hero/trajectory-full.mp4" width={960} height={540}
                muted playsInline preload="auto" disablePictureInPicture
                onSeeked={(e) => { e.currentTarget.dataset.playing = '' }} />
            )}
          </span>
          <figcaption>
            <span className="t-mono-s">{c.label}</span>
            <span className="t-mono-s">{c.t}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

// ── Paste a link (S1b / S1c) ─────────────────────────────────────────────────
function PasteLink({ onFile, onClose, onBusy }: { onFile: (f: File) => void; onClose: () => void; onBusy: (b: boolean) => void }) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => () => { abortRef.current?.abort(); onBusy(false) }, [onBusy])

  async function load(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed || loading) return
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true); setError(null); setProgress(null); onBusy(true)
    try { setName(new URL(trimmed).pathname.split('/').pop() || 'the video') } catch { setName('the video') }

    try {
      const resp = await fetch(trimmed, { mode: 'cors', signal: ctrl.signal })
      if (!resp.ok) {
        if (resp.status === 403 || resp.status === 401) {
          throw new Error(`Access denied (${resp.status}). The link may have expired or need a login.`)
        }
        throw new Error(`The server returned ${resp.status}.`)
      }
      const contentType = resp.headers.get('content-type') ?? ''
      const isVideo = contentType.startsWith('video/') || contentType.includes('octet-stream')
      const looksLikeVideo = /\.(mp4|mov|webm|mkv|m4v|avi)/i.test(trimmed.split('?')[0])
      if (!isVideo && !looksLikeVideo) throw new Error("This link doesn't point to a video file.")

      const total = Number(resp.headers.get('content-length')) || null
      const reader = resp.body!.getReader()
      const parts: Uint8Array[] = []
      let loaded = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        parts.push(value)
        loaded += value.byteLength
        if (total) setProgress(Math.round((loaded / total) * 100))
      }

      const mimeType = contentType.split(';')[0].trim() || 'video/mp4'
      let filename = 'video.mp4'
      const disp = resp.headers.get('content-disposition') ?? ''
      const m = disp.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)/i)
      if (m) filename = decodeURIComponent(m[1].trim())
      else {
        const last = new URL(trimmed).pathname.split('/').pop()
        if (last && /\.[a-z0-9]{2,4}$/i.test(last)) filename = last
      }
      onFile(new File([new Blob(parts as BlobPart[], { type: mimeType })], filename, { type: mimeType }))
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : String(err)
      const lower = msg.toLowerCase()
      setError(lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('cors')
        ? "This site doesn't let browsers download its videos directly. Download the file, then choose it instead."
        : msg)
    } finally {
      setLoading(false); setProgress(null); onBusy(false)
    }
  }

  return (
    <form className="field paste" onSubmit={load} noValidate>
      <label className="field__label" htmlFor="video-url">Video link</label>
      <span className="field__hint" id="video-url-hint">A direct link to a video file, like one ending in .mp4</span>
      <div className="paste__row">
        <div className="field__control" data-state={error ? 'error' : undefined}>
          <Link size={16} aria-hidden="true" />
          <input
            ref={inputRef} id="video-url" type="url" inputMode="url" spellCheck={false}
            placeholder="https://example.com/video.mp4"
            aria-describedby="video-url-hint" aria-invalid={!!error}
            value={url} disabled={loading}
            onChange={(e) => { setUrl(e.target.value); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
          />
        </div>
        <button type="submit" className="btn btn--primary btn--l paste__go" disabled={loading || !url.trim()}>
          {loading
            ? <><Spinner /><span className="t-mono-s">{progress != null ? `${progress}%` : ''}</span><span className="sr-only">Downloading</span></>
            : 'Load'}
        </button>
        <button type="button" className="icon-btn" onClick={() => { abortRef.current?.abort(); onClose() }} aria-label="Close the link field">
          <Close size={16} />
        </button>
      </div>
      <div aria-live="polite">
        {loading && <p className="field__hint">Downloading {name} into this tab. Nothing is uploaded.</p>}
        {error && <p className="field__error"><WarningFilled size={14} />{error}</p>}
      </div>
    </form>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Reset, Copy, Checkmark, Microphone, DocumentDownload, Close } from '@carbon/icons-react'
import Player, { useVideoTime } from '../components/Player'
import Filmstrip, { useThumbs, type Marker } from '../components/Filmstrip'
import StoryboardView from '../components/StoryboardView'
import { Toggle, Progress, Spinner } from '../ui/primitives'
import type { Frame, ExtractionParams, AspectRatio } from '../lib/extractor'
import { fmtTimecode } from '../lib/extractor'
import { transcriptToMarkdown } from '../lib/transcript-types'
import { frameFilename, packAsZip, triggerDownload } from '../lib/zip'
import type { Transcript } from './Slice'

type Tab = 'frames' | 'transcript' | 'storyboard'

type Props = {
  file: File
  duration: number
  videoMode: 'native' | 'ffmpeg'
  frames: Frame[]
  params: ExtractionParams
  dims: { w: number; h: number } | null
  aspectRatio: AspectRatio
  onAspectRatio: (r: AspectRatio) => void
  transcript: Transcript
  onRetryTranscript: () => void
  onStartOver: () => void
}

function fmtMB(bytes: number) {
  const mb = bytes / 1024 / 1024
  return mb < 1 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${mb.toFixed(mb < 10 ? 1 : 0)} MB`
}

function summary(p: Props, bytes: number): string {
  const { params, file } = p
  const rhythm =
    params.mode === 'interval' ? (params.interval === 1 ? 'one frame every second' : `one frame every ${params.interval} seconds`)
    : params.mode === 'count' ? 'spread evenly across the video'
    : params.mode === 'custom' ? 'at the moments you marked'
    : 'one shot per spoken line'
  const dims = p.dims ? `${p.dims.w} × ${p.dims.h} JPEG` : 'JPEG'
  return `From ${file.name}, ${rhythm}${params.uniqueOnly && (params.mode === 'interval' || params.mode === 'count') ? ', unique frames only' : ''}. ${dims}, ${fmtMB(bytes)} in total.`
}

export default function Result(p: Props) {
  const storyboard = p.params.mode === 'storyboard'
  const tx = p.transcript
  const hasTx = tx.enabled && tx.status !== 'idle'
  const [tab, setTab] = useState<Tab>(storyboard ? 'storyboard' : 'frames')
  // Tab panel rises in on a tab switch only; on arrival the stage itself rises,
  // and nesting both made the content lurch twice
  const firstTab = useRef(tab)
  const tabChanged = useRef(false)
  if (tab !== firstTab.current) tabChanged.current = true
  const [packing, setPacking] = useState(false)
  const [includeTx, setIncludeTx] = useState(true)
  const bytes = useMemo(() => p.frames.reduce((s, f) => s + f.blob.size, 0), [p.frames])
  const md = tx.result ? transcriptToMarkdown(tx.result, p.file.name) : null
  const txReady = tx.status === 'done' && !!md

  async function downloadSet(set: Frame[]) {
    if (packing || !set.length) return
    if (set.length === 1 && !(includeTx && txReady)) { triggerDownload(set[0].blob, frameFilename(set[0])); return }
    setPacking(true)
    try {
      const zip = await packAsZip(set, includeTx && txReady ? md! : undefined)
      const stem = p.file.name.replace(/\.[^.]+$/, '')
      triggerDownload(zip, `${stem}_frames.zip`)
    } finally { setPacking(false) }
  }

  const title = storyboard ? `${p.frames.length} shot${p.frames.length === 1 ? '' : 's'}` : `${p.frames.length} frame${p.frames.length === 1 ? '' : 's'}`
  const sub = storyboard
    ? `One shot per ${tx.status === 'done' ? 'spoken line' : 'marked moment'}, framed at ${p.aspectRatio} and ready to export as PDF.`
    : summary(p, bytes)

  return (
    <div className="result">
      <header className="result__head">
        <div>
          <h1 className="t-display-l">{title}</h1>
          <p className="t-body-m c-subtle">{sub}</p>
        </div>
        <div className="result__actions">
          <button type="button" className="btn btn--ghost btn--l" onClick={p.onStartOver}><Reset size={16} /> Start over</button>
          <button type="button" className="btn btn--secondary btn--l" onClick={() => downloadSet(p.frames)} disabled={packing}>
            {packing ? <Spinner /> : <Download size={16} />} {packing ? 'Packing…' : 'Download all frames'}
          </button>
        </div>
      </header>

      <div className="result__tabs">
        <div className="tabs" role="tablist" aria-label="Results">
          <TabBtn id="frames" tab={tab} setTab={setTab}>Frames <span className="chip-count">{p.frames.length}</span></TabBtn>
          {hasTx && (
            <TabBtn id="transcript" tab={tab} setTab={setTab}>
              Transcript {tx.status === 'done'
                ? <span className="chip-count">{tx.result?.chunks?.length ?? 0}</span>
                : tx.status !== 'error' && <Spinner />}
            </TabBtn>
          )}
          {storyboard && <TabBtn id="storyboard" tab={tab} setTab={setTab}>Storyboard <span className="chip-count">{p.frames.length}</span></TabBtn>}
        </div>
        {tab === 'frames' && txReady && (
          <label className="result__include t-label-m">
            <Toggle checked={includeTx} onChange={setIncludeTx} label="Include transcript in ZIP" /> Include transcript in ZIP
          </label>
        )}
      </div>

      <div className={`result__panel${tabChanged.current ? ' stage-in' : ''}`} key={tab} role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'frames' && <FramesTab frames={p.frames} onDownload={downloadSet} packing={packing} />}
        {tab === 'transcript' && <TranscriptTab {...p} />}
        {tab === 'storyboard' && (
          <StoryboardView frames={p.frames} chunks={p.frames.map((_, i) => tx.result?.chunks?.[i])}
            filename={p.file.name} aspectRatio={p.aspectRatio} onAspectRatio={p.onAspectRatio} />
        )}
      </div>
    </div>
  )
}

function TabBtn({ id, tab, setTab, children }: { id: Tab; tab: Tab; setTab: (t: Tab) => void; children: React.ReactNode }) {
  return (
    <button type="button" role="tab" id={`tab-${id}`} className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
      {children}
    </button>
  )
}

// ── S5: frames grid + selection bar ─────────────────────────────────────────
function FramesTab({ frames, onDownload, packing }: { frames: Frame[]; onDownload: (f: Frame[]) => void; packing: boolean }) {
  const [sel, setSel] = useState<Set<number>>(new Set())
  const toggle = (i: number) => setSel((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })
  const picked = frames.filter((f) => sel.has(f.index))

  useEffect(() => {
    if (!sel.size) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSel(new Set()) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel.size])

  return (
    <>
      <ul className="tiles" aria-label="Frames. Select to download a few, or download one directly.">
        {frames.map((f, i) => {
          const on = sel.has(f.index)
          return (
            // M6: first 12 stagger in, the rest arrive with the grid
            <li key={f.index} className="tile" data-selected={on || undefined} style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
              <button type="button" className="tile__select" aria-pressed={on} onClick={() => toggle(f.index)}
                aria-label={`Frame ${f.index} at ${fmtTimecode(f.timestamp)}${on ? ', selected' : ''}`}>
                <img src={f.url} alt="" loading="lazy" />
                <span className="tile__scrim" aria-hidden="true" />
                <span className="tile__meta" aria-hidden="true">
                  <span className="t-mono-s">{String(f.index).padStart(3, '0')}</span>
                  <span className="t-mono-s">{fmtTimecode(f.timestamp)}</span>
                </span>
                <span className="tile__check" aria-hidden="true"><Checkmark size={14} /></span>
              </button>
              <button type="button" className="icon-btn tile__dl" onClick={() => triggerDownload(f.blob, frameFilename(f))} aria-label={`Download frame ${f.index}`}>
                <Download size={16} />
              </button>
            </li>
          )
        })}
      </ul>

      {/* M10: persistent selection bar; stays while switching tabs is not needed
          because selection lives in this tab and clears with Esc or Clear */}
      {picked.length > 0 && (
        <div className="selbar" role="region" aria-label="Selection">
          <span className="t-label-m">{picked.length} frame{picked.length === 1 ? '' : 's'} selected</span>
          <span className="selbar__rule" aria-hidden="true" />
          <button type="button" className="btn btn--ghost" onClick={() => setSel(new Set())}><Close size={16} /> Clear</button>
          <button type="button" className="btn btn--primary" onClick={() => onDownload(picked)} disabled={packing}>
            <Download size={16} /> Download {picked.length}
          </button>
        </div>
      )}
    </>
  )
}

// ── S6 / S6b / S6c: transcript ──────────────────────────────────────────────
function TranscriptTab(p: Props) {
  const tx = p.transcript
  const videoRef = useRef<HTMLVideoElement>(null)
  const native = p.videoMode === 'native'
  const thumbs = useThumbs(native ? p.file : null, p.duration)
  const { t } = useVideoTime(videoRef)
  const [copied, setCopied] = useState(false)
  const chunks = tx.result?.chunks ?? []
  const long = chunks.length > 8
  const [follow, setFollow] = useState(true)
  const listRef = useRef<HTMLOListElement>(null)

  const active = useMemo(() => {
    let a = -1
    for (let i = 0; i < chunks.length; i++) if (chunks[i].timestamp[0] <= t + 0.05) a = i
    return a
  }, [chunks, t])

  useEffect(() => {
    if (!follow || active < 0) return
    const el = listRef.current?.children[active] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [active, follow])

  const markers: Marker[] = chunks.map((c) => ({ t: c.timestamp[0], kind: 'tick' }))

  async function copy() {
    const text = chunks.length ? chunks.map((c) => `${fmtT(c.timestamp[0])}  ${c.text.trim()}`).join('\n') : tx.result?.text ?? ''
    try { await navigator.clipboard.writeText(text) } catch { /* blocked: nothing to copy into */ }
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  function downloadMd() {
    if (!tx.result) return
    const stem = p.file.name.replace(/\.[^.]+$/, '')
    triggerDownload(new Blob([transcriptToMarkdown(tx.result, p.file.name)], { type: 'text/markdown' }), `transcript_${stem}.md`)
  }
  const seek = (s: number) => { const v = videoRef.current; if (v) { v.currentTime = s; void v.play() } }

  return (
    <div className="tx">
      <div className="tx__media">
        {native
          ? <><Player file={p.file} videoRef={videoRef} duration={p.duration} /><Filmstrip duration={p.duration} thumbs={thumbs} videoRef={videoRef} markers={markers} /></>
          : <div className="converter"><p className="t-body-m c-subtle">Preview is off for this file.</p></div>}
      </div>

      <section className="tx__body" aria-label="Transcript">
        <header className="tx__head">
          <h2 className="t-title-s">Transcript</h2>
          {tx.result && (
            <div className="tx__tools">
              {long && (
                <label className="t-label-m tx__follow">
                  <Toggle checked={follow} onChange={setFollow} label="Follow playback" /> Follow playback
                </label>
              )}
              <button type="button" className="btn btn--ghost" onClick={copy}>{copied ? <Checkmark size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy'}</button>
              <button type="button" className="btn btn--secondary" onClick={downloadMd}><DocumentDownload size={16} /> Download .md</button>
            </div>
          )}
        </header>

        {(tx.status === 'loading-model' || tx.status === 'loading-model-multilingual') && (
          <div className="tx-card" role="status">
            <div className="tx-card__row">
              <Microphone size={16} /><span className="t-label-m">Downloading the speech model</span>
              {tx.progress != null && <span className="t-mono-s c-subtle tx-card__pct">{tx.progress}%</span>}
            </div>
            <Progress value={(tx.progress ?? 0) / 100} label="Speech model download" />
            <p className="t-caption c-subtle">First time only. It stays in your browser and loads instantly after this.</p>
          </div>
        )}
        {(tx.status === 'model-cached' || tx.status === 'decoding-audio' || tx.status === 'transcribing') && (
          <div className="tx-card" role="status">
            <div className="tx-card__row"><Spinner /><span className="t-label-m">{tx.msg || 'Transcribing…'}</span></div>
          </div>
        )}
        {tx.status === 'error' && (
          <div className="tx-error" role="alert">
            <span className="tx-error__icon"><Microphone size={20} /></span>
            <h3 className="t-title-s">We couldn't transcribe this video</h3>
            <p className="t-body-m c-subtle">{tx.msg || 'The audio track uses a format we can’t decode.'} Try again, or export the video as MP4 or WebM and upload it.</p>
            <div><button type="button" className="btn btn--secondary" onClick={p.onRetryTranscript}>Try again</button></div>
            <p className="t-caption c-subtle">Your frames are ready either way. Download them from the Frames tab.</p>
          </div>
        )}

        {tx.result && (chunks.length > 0 ? (
          <>
            <ol className="tx__lines" ref={listRef} data-long={long || undefined}>
              {chunks.map((c, i) => (
                <li key={i}>
                  <button type="button" className="tx-line-btn" data-active={i === active || undefined} onClick={() => seek(c.timestamp[0])}
                    aria-current={i === active ? 'time' : undefined}>
                    <span className="t-mono-s c-subtle">{fmtT(c.timestamp[0])}</span>
                    <span className="t-transcript">{c.text.trim()}</span>
                  </button>
                </li>
              ))}
            </ol>
            <p className="t-caption c-subtle">Click a line to jump to that moment.</p>
          </>
        ) : <p className="t-transcript">{tx.result.text}</p>)}
      </section>
    </div>
  )
}

function fmtT(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

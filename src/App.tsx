import { useRef, useState, useCallback, useEffect } from 'react'
import Topbar, { type Step } from './components/Topbar'
import { useTheme } from './components/ThemeToggle'
import Home from './stages/Home'
import Slice, { type Transcript } from './stages/Slice'
import Result from './stages/Result'
import ErrorPage from './stages/ErrorPage'
import type { Frame, ExtractionParams, AspectRatio } from './lib/extractor'
import { buildTimestamps, extractNative, extractFFmpeg, loadFFmpeg, probeWithFFmpeg, ASPECT_RATIO_H } from './lib/extractor'
import type { TranscriptLang } from './lib/transcript-types'

export type MarkedFrame = { id: number; timestamp: number; thumbnail: string }

type VideoMode = 'native' | 'ffmpeg'
type Progress = { done: number; total: number; kept?: number; startedAt: number }

function detectAspectRatio(w: number, h: number): AspectRatio {
  if (!w || !h) return '16:9'
  const ratio = w / h
  const options = Object.entries(ASPECT_RATIO_H) as [AspectRatio, number][]
  return options.reduce((best, [key, hRatio]) =>
    Math.abs(ratio - 1 / hRatio) < Math.abs(ratio - 1 / ASPECT_RATIO_H[best]) ? key : best
  , '16:9' as AspectRatio)
}

const DEFAULT_PARAMS: ExtractionParams = { mode: 'interval', interval: 1, count: 20, quality: 0.85, uniqueOnly: false }
const TX_IDLE = { status: 'idle' as const, msg: '', progress: null, result: null }

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme()
  const videoRef = useRef<HTMLVideoElement>(null)
  const ffInputRef = useRef<string | null>(null)
  const ffRef = useRef<import('@ffmpeg/ffmpeg').FFmpeg | null>(null)
  const abortRef = useRef(false)
  const txRunRef = useRef(0)

  const [file, setFile] = useState<File | null>(null)
  const [duration, setDuration] = useState(0)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [videoMode, setVideoMode] = useState<VideoMode>('native')
  const [converterMsg, setConverterMsg] = useState<string | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)
  const [frames, setFrames] = useState<Frame[]>([])
  const [marked, setMarked] = useState<MarkedFrame[]>([])
  const [extracting, setExtracting] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'slice' | 'result'>('slice')
  const [linkBusy, setLinkBusy] = useState(false)

  const [params, setParams] = useState<ExtractionParams>(DEFAULT_PARAMS)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9')
  const [tx, setTx] = useState<Transcript>({ enabled: false, lang: 'en', ...TX_IDLE })

  // ── Transcription ─────────────────────────────────────────────────────────
  const runTranscription = useCallback((f: File, lang: TranscriptLang) => {
    const run = ++txRunRef.current // a newer run supersedes an older one
    setTx((p) => ({ ...p, lang, status: 'loading-model', msg: 'Loading the speech model…', progress: null, result: null }))
    import('./lib/transcriber').then(({ transcribeFile }) =>
      transcribeFile(f, (status, msg, prog) => {
        if (run !== txRunRef.current) return
        setTx((p) => ({ ...p, status, msg: msg ?? '', progress: status === 'loading-model' || status === 'loading-model-multilingual' ? (prog ?? null) : null }))
      }, ffRef.current, ffInputRef.current, lang),
    ).then((result) => {
      if (run === txRunRef.current) setTx((p) => ({ ...p, status: 'done', msg: '', progress: null, result }))
    }).catch((err) => {
      if (run === txRunRef.current) setTx((p) => ({ ...p, status: 'error', msg: String(err instanceof Error ? err.message : err), progress: null, result: null }))
    })
  }, [])

  // Start once the video is readable, if the person opted in (home or panel)
  const txWanted = tx.enabled && !!file && duration > 0
  useEffect(() => {
    if (txWanted && tx.status === 'idle') runTranscription(file!, tx.lang)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txWanted])

  const setTranscribe = useCallback((on: boolean) => {
    if (!on) { txRunRef.current++; setTx((p) => ({ ...p, enabled: false, ...TX_IDLE })); return }
    setTx((p) => ({ ...p, enabled: true }))
    if (file && duration > 0) runTranscription(file, tx.lang)
  }, [file, duration, tx.lang, runTranscription])

  const setLang = useCallback((lang: TranscriptLang) => {
    setTx((p) => ({ ...p, lang }))
    if (tx.enabled && file && duration > 0 && lang !== tx.lang) runTranscription(file, lang)
  }, [tx.enabled, tx.lang, file, duration, runTranscription])

  // ── Load video ────────────────────────────────────────────────────────────
  const resetVideo = useCallback(() => {
    abortRef.current = true
    txRunRef.current++
    setFrames((fs) => { fs.forEach((f) => URL.revokeObjectURL(f.url)); return [] })
    setFile(null); setDuration(0); setDims(null); setVideoMode('native'); setConverterMsg(null)
    setFatal(null); setMarked([]); setExtracting(false); setProgress(null); setError(null); setView('slice')
    setTx((p) => ({ ...p, ...TX_IDLE }))
    ffInputRef.current = null
  }, [])

  const handleFile = useCallback((f: File) => {
    resetVideo()
    setFile(f)
    const probe = document.createElement('video')
    probe.preload = 'metadata'
    const url = URL.createObjectURL(f)
    probe.src = url
    let settled = false
    const cleanup = () => { probe.removeEventListener('loadedmetadata', onReady); probe.removeEventListener('loadeddata', onReady); URL.revokeObjectURL(url) }
    const onReady = () => {
      if (settled || !probe.videoWidth) return
      settled = true; cleanup()
      setDims({ w: probe.videoWidth, h: probe.videoHeight })
      setAspectRatio(detectAspectRatio(probe.videoWidth, probe.videoHeight))
      setVideoMode('native'); setDuration(probe.duration)
    }
    const onError = async () => {
      if (settled) return
      settled = true; cleanup()
      try {
        setVideoMode('ffmpeg')
        setConverterMsg('Loading the universal converter, about 30 MB, first time only…')
        const ff = await loadFFmpeg((m) => setConverterMsg(m))
        ffRef.current = ff
        const { duration: d, inputName } = await probeWithFFmpeg(ff, f, () => setConverterMsg('Reading the video…'))
        ffInputRef.current = inputName
        setConverterMsg(null); setDuration(d)
        setParams((p) => (p.mode === 'custom' ? { ...p, mode: 'interval' } : p))
      } catch (e) {
        setConverterMsg(null)
        setFatal(e instanceof Error ? e.message : String(e))
      }
    }
    probe.addEventListener('loadedmetadata', onReady)
    probe.addEventListener('loadeddata', onReady)
    probe.addEventListener('error', onError, { once: true })
  }, [resetVideo])

  // ── Marks ─────────────────────────────────────────────────────────────────
  const onMark = useCallback((timestamp: number, thumbnail: string) => {
    setMarked((m) => [...m, { id: Date.now() + Math.random(), timestamp, thumbnail }].sort((a, b) => a.timestamp - b.timestamp))
  }, [])
  const onUnmark = useCallback((id: number) => setMarked((m) => m.filter((x) => x.id !== id)), [])

  // ── Extract / cancel ──────────────────────────────────────────────────────
  const handleExtract = useCallback(async () => {
    if (extracting || !file || !duration) return
    const timestamps =
      params.mode === 'storyboard'
        ? tx.result?.chunks?.length ? tx.result.chunks.map((c) => c.timestamp[0]) : marked.map((m) => m.timestamp)
        : params.mode === 'custom' ? marked.map((m) => m.timestamp)
        : buildTimestamps(duration, params)
    if (!timestamps.length) return

    frames.forEach((f) => URL.revokeObjectURL(f.url))
    abortRef.current = false
    videoRef.current?.pause()
    setFrames([]); setError(null); setExtracting(true)
    const total = timestamps.length
    const startedAt = performance.now()
    setProgress({ done: 0, total, startedAt })
    const collected: Frame[] = []
    const uniqueOnly = params.uniqueOnly && (params.mode === 'interval' || params.mode === 'count')
    const onScan = (n: number) => setProgress({ done: n, total, kept: uniqueOnly ? collected.length : undefined, startedAt })

    try {
      const gen = videoMode === 'ffmpeg' && ffRef.current && ffInputRef.current
        ? extractFFmpeg(ffRef.current, ffInputRef.current, timestamps, params.quality, uniqueOnly, onScan)
        : extractNative(videoRef.current!, timestamps, params.quality, uniqueOnly, onScan)
      for await (const frame of gen) {
        if (abortRef.current) { URL.revokeObjectURL(frame.url); break }
        collected.push(frame)
        setFrames([...collected])
      }
      if (abortRef.current) { collected.forEach((f) => URL.revokeObjectURL(f.url)); setFrames([]) }
      else setView('result')
    } catch (e) {
      setError(`Extraction failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setExtracting(false); setProgress(null)
    }
  }, [extracting, file, duration, params, tx.result, marked, frames, videoMode])

  const cancel = useCallback(() => { abortRef.current = true }, [])

  // ── Stage ─────────────────────────────────────────────────────────────────
  const stage: 'home' | 'slice' | 'result' | 'error' =
    !file ? 'home' : fatal ? 'error' : view === 'result' && frames.length && !extracting ? 'result' : 'slice'
  const step: Step = stage === 'home' ? 1 : stage === 'result' ? 3 : 2
  const txActive = tx.enabled && !!file && !['idle', 'done', 'error'].includes(tx.status)
  const busy = linkBusy || extracting || (!!file && !duration && !fatal) || txActive

  const first = useRef(true)
  useEffect(() => { first.current = false }, [])

  return (
    <div className="app">
      <Topbar
        theme={theme} onToggleTheme={toggleTheme} step={step} busy={busy}
        canGoTo={(s) => (s === 2 && stage === 'result') || (s === 3 && stage === 'slice' && frames.length > 0 && !extracting)}
        onGoTo={(s) => setView(s === 3 ? 'result' : 'slice')}
      />
      <main className={`main${first.current ? '' : ' stage-in'}`} key={stage} data-stage={stage}>
        {stage === 'home' && (
          <Home
            theme={theme} onFile={handleFile} onBusy={setLinkBusy}
            transcribe={tx.enabled} onTranscribe={(on) => setTx((p) => ({ ...p, enabled: on }))}
            lang={tx.lang} onLang={(l) => setTx((p) => ({ ...p, lang: l }))}
          />
        )}
        {stage === 'error' && <ErrorPage fileName={file!.name} error={fatal!} onRetry={resetVideo} />}
        {stage === 'slice' && (
          <Slice
            file={file!} duration={duration} videoMode={videoMode} converterMsg={converterMsg} videoRef={videoRef}
            params={params} onParams={setParams} aspectRatio={aspectRatio} onAspectRatio={setAspectRatio}
            marked={marked} onMark={onMark} onUnmark={onUnmark}
            transcript={tx} onTranscribe={setTranscribe} onLang={setLang}
            onReplace={resetVideo} onExtract={handleExtract} extracting={extracting} progress={progress}
            frames={frames} onCancel={cancel} error={error}
          />
        )}
        {stage === 'result' && (
          <Result
            file={file!} duration={duration} videoMode={videoMode} frames={frames} params={params} dims={dims}
            aspectRatio={aspectRatio} onAspectRatio={setAspectRatio}
            transcript={tx} onRetryTranscript={() => file && runTranscription(file, tx.lang)}
            onStartOver={resetVideo}
          />
        )}
      </main>
    </div>
  )
}

import { useRef, useState, useCallback } from 'react'
import { AlertCircle, Info } from 'lucide-react'
import Navbar from './components/Navbar'
import { useTheme } from './components/ThemeToggle'
import Dropzone from './components/Dropzone'
import Workspace from './components/Workspace'
import ResultsArea from './components/ResultsArea'
import type { Frame, ExtractionParams } from './lib/extractor'
import {
  buildTimestamps, extractNative, extractFFmpeg,
  loadFFmpeg, probeWithFFmpeg,
} from './lib/extractor'
import type { TranscriptStatus, TranscriptResult, TranscriptLang } from './lib/transcriber'
import { transcribeFile } from './lib/transcriber'

export type MarkedFrame = {
  id: number
  timestamp: number
  thumbnail: string // low-res data URL for preview
}

type VideoMode = 'native' | 'ffmpeg'

type AppState = {
  file: File | null
  duration: number
  videoMode: VideoMode
  frames: Frame[]
  markedFrames: MarkedFrame[]
  extracting: boolean
  progress: { done: number; total: number } | null
  error: string | null
  status: string | null
  showFallbackHelp: boolean
}

const DEFAULT_PARAMS: ExtractionParams = {
  mode: 'interval',
  interval: 1,
  count: 20,
  quality: 0.85,
}

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme()
  const videoRef = useRef<HTMLVideoElement>(null)
  const ffmpegInputRef = useRef<string | null>(null)
  const ffmpegInstanceRef = useRef<import('@ffmpeg/ffmpeg').FFmpeg | null>(null)

  const [state, setState] = useState<AppState>({
    file: null, duration: 0, videoMode: 'native',
    frames: [], markedFrames: [],
    extracting: false, progress: null,
    error: null, status: null, showFallbackHelp: false,
  })
  const [params, setParams] = useState<ExtractionParams>(DEFAULT_PARAMS)
  const [transcriptEnabled, setTranscriptEnabled] = useState(false)
  const [transcriptLang, setTranscriptLang] = useState<TranscriptLang>('en')
  const [transcript, setTranscript] = useState<{
    status: TranscriptStatus
    statusMsg: string
    result: TranscriptResult | null
    downloadProgress: number | null
  }>({ status: 'idle', statusMsg: '', result: null, downloadProgress: null })

  const patch = (partial: Partial<AppState>) => setState((s) => ({ ...s, ...partial }))

  // ── Transcription runner ──────────────────────────────────────────────────

  const runTranscription = useCallback((file: File, lang: TranscriptLang, ffmpegInst?: import('@ffmpeg/ffmpeg').FFmpeg | null, ffmpegName?: string | null) => {
    setTranscript({ status: 'loading-model', statusMsg: 'Loading model…', result: null, downloadProgress: null })
    transcribeFile(
      file,
      (status, msg, progress) => setTranscript(prev => ({
        ...prev, status, statusMsg: msg ?? '',
        downloadProgress: (status === 'loading-model' || status === 'loading-model-multilingual') ? (progress ?? null) : null,
      })),
      ffmpegInst, ffmpegName, lang,
    ).then(result => {
      setTranscript({ status: 'done', statusMsg: '', result, downloadProgress: null })
    }).catch(err => {
      setTranscript({ status: 'error', statusMsg: String(err instanceof Error ? err.message : err), result: null, downloadProgress: null })
    })
  }, [])

  // ── Transcript opt-in toggle ──────────────────────────────────────────────

  const handleTranscriptEnabledChange = useCallback((enabled: boolean) => {
    setTranscriptEnabled(enabled)
    if (enabled && state.file && state.duration > 0) {
      runTranscription(state.file, transcriptLang, ffmpegInstanceRef.current, ffmpegInputRef.current)
    } else if (!enabled) {
      setTranscript({ status: 'idle', statusMsg: '', result: null, downloadProgress: null })
    }
  }, [state.file, state.duration, transcriptLang, runTranscription])

  // ── Language change (re-transcribe with new lang) ─────────────────────────

  const handleLanguageChange = useCallback((lang: TranscriptLang) => {
    setTranscriptLang(lang)
    if (state.file && state.duration > 0) {
      runTranscription(state.file, lang, ffmpegInstanceRef.current, ffmpegInputRef.current)
    }
  }, [state.file, state.duration, runTranscription])

  // ── Load video ────────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    patch({ file, frames: [], markedFrames: [], error: null, status: null, showFallbackHelp: false, duration: 0 })
    setTranscript({ status: 'idle', statusMsg: '', result: null, downloadProgress: null })

    const probe = document.createElement('video')
    probe.preload = 'metadata'
    const url = URL.createObjectURL(file)
    probe.src = url
    let settled = false

    const cleanup = () => {
      probe.removeEventListener('loadedmetadata', onReady)
      probe.removeEventListener('loadeddata', onReady)
      URL.revokeObjectURL(url)
    }

    // Read transcriptEnabled from a ref so the callback always sees fresh value
    const onReady = () => {
      if (settled || !probe.videoWidth) return
      settled = true
      cleanup()
      patch({ duration: probe.duration, videoMode: 'native', status: null })
      // transcription triggered only if user opted in
    }

    const onError = async () => {
      if (settled) return
      settled = true
      cleanup()
      try {
        patch({ status: 'Codec not supported natively — loading universal converter…' })
        const ff = await loadFFmpeg((msg) => patch({ status: msg }))
        ffmpegInstanceRef.current = ff
        const { duration, inputName } = await probeWithFFmpeg(ff, file, (msg) => patch({ status: msg }))
        ffmpegInputRef.current = inputName
        patch({ duration, videoMode: 'ffmpeg', status: null })
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        patch({ status: null, error: msg, showFallbackHelp: true })
      }
    }

    probe.addEventListener('loadedmetadata', onReady)
    probe.addEventListener('loadeddata', onReady)
    probe.addEventListener('error', onError, { once: true })
  }, [])

  // ── Custom mode: mark / remove ────────────────────────────────────────────

  const handleMark = useCallback((timestamp: number, thumbnail: string) => {
    setState((s) => ({
      ...s,
      markedFrames: [...s.markedFrames, { id: Date.now() + Math.random(), timestamp, thumbnail }]
        .sort((a, b) => a.timestamp - b.timestamp),
    }))
  }, [])

  const handleRemoveMark = useCallback((id: number) => {
    setState((s) => ({ ...s, markedFrames: s.markedFrames.filter((m) => m.id !== id) }))
  }, [])

  // ── Extract ───────────────────────────────────────────────────────────────

  const handleExtract = useCallback(async () => {
    if (state.extracting || !state.file || !state.duration) return

    const timestamps = params.mode === 'custom'
      ? state.markedFrames.map((m) => m.timestamp)
      : buildTimestamps(state.duration, params)

    if (timestamps.length === 0) return

    state.frames.forEach((f) => URL.revokeObjectURL(f.url))
    patch({ extracting: true, frames: [], error: null, progress: null })

    const total = timestamps.length
    const collected: Frame[] = []

    try {
      const gen = state.videoMode === 'ffmpeg' && ffmpegInstanceRef.current && ffmpegInputRef.current
        ? extractFFmpeg(ffmpegInstanceRef.current, ffmpegInputRef.current, timestamps, params.quality)
        : extractNative(videoRef.current!, timestamps, params.quality)

      for await (const frame of gen) {
        collected.push(frame)
        const snapshot = [...collected]
        setState((s) => ({ ...s, frames: snapshot, progress: { done: snapshot.length, total } }))
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      patch({ error: `Extraction failed: ${msg}` })
    } finally {
      patch({ extracting: false, progress: null })
    }
  }, [state, params])

  const handleClear = useCallback(() => {
    state.frames.forEach((f) => URL.revokeObjectURL(f.url))
    patch({ frames: [] })
  }, [state.frames])

  const handleClearVideo = useCallback(() => {
    state.frames.forEach((f) => URL.revokeObjectURL(f.url))
    setState({
      file: null, duration: 0, videoMode: 'native',
      frames: [], markedFrames: [], extracting: false, progress: null,
      error: null, status: null, showFallbackHelp: false,
    })
    setTranscript({ status: 'idle', statusMsg: '', result: null, downloadProgress: null })
    setTranscriptEnabled(false)
    if (videoRef.current) videoRef.current.src = ''
    ffmpegInputRef.current = null
  }, [state.frames])

  // ── Render ────────────────────────────────────────────────────────────────

  const hasVideo = !!state.file && state.duration > 0
  const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:'

  return (
    <>
      <Navbar theme={theme} onToggleTheme={toggleTheme} />

      <main style={{ width: '80%', margin: '0 auto', padding: '40px 0 24px' }}>

        {/* Hero */}
        <header style={{ marginBottom: 48 }}>
          <p style={{
            fontFamily: "'Macklin Sans', 'DM Sans', sans-serif",
            fontSize: 12, fontWeight: 300, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: 'var(--text-secondary)',
            marginBottom: 12,
          }}>
            A tool by{' '}
            <a
              href="https://jorgeverlindo.design"
              style={{
                color: 'var(--brand)',
                textDecoration: 'none',
                borderBottom: '1px solid var(--brand-35)',
                paddingBottom: '1px',
                transition: 'border-color var(--t-fast)',
              }}
            >
              Jorge Verlindo
            </a>
          </p>
          <h1>Video Slicer</h1>
          <p style={{
            fontFamily: "'Macklin Sans', 'DM Sans', sans-serif",
            color: 'var(--text-secondary)', fontSize: 18,
            fontWeight: 300, marginTop: 16, lineHeight: 1.5,
            maxWidth: 560,
          }}>
            Extract frames from any video, locally in your browser.
            No upload, no server — the file never leaves your machine.
          </p>
        </header>

        {/* Dropzone */}
        {!hasVideo && <Dropzone onFile={handleFile} />}

        {/* Status alert */}
        {state.status && (
          <div className="alert alert-info" style={{ marginTop: 16 }}>
            <Info size={20} style={{ flexShrink: 0, marginTop: 1 }} />
            <div className="alert-body">{state.status}</div>
          </div>
        )}

        {/* Error alert */}
        {state.error && (
          <div className="alert alert-error" style={{ marginTop: 16 }}>
            <AlertCircle size={20} style={{ flexShrink: 0, marginTop: 1 }} />
            <div className="alert-body">{state.error}</div>
          </div>
        )}

        {/* Fallback help */}
        {state.showFallbackHelp && (
          <div className="solution-panel">
            <div style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'flex-start' }}>
              <div style={{
                flexShrink: 0, width: 32, height: 32, borderRadius: '50%',
                background: 'var(--destructive-bg)', color: 'var(--destructive)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <AlertCircle size={18} />
              </div>
              <div style={{ fontFamily: "'Macklin Text','Playfair Display',serif", fontSize: 20, fontWeight: 400, color: 'var(--text-primary)', lineHeight: 1.3, letterSpacing: '-0.02em' }}>
                We can&apos;t process this video
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, marginLeft: 44 }}>
              {state.error}
            </div>
            {isFileProtocol && (
              <div className="solution">
                <div className="solution-title">Solution 1 · Run a local server</div>
                <code>npm run dev</code>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
                  Then open <strong style={{ color: 'var(--brand)' }}>http://localhost:5174</strong>
                </div>
              </div>
            )}
            <div className="solution">
              <div className="solution-title">Solution 2 · Convert the video first</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
                <strong style={{ color: 'var(--text-primary)' }}>macOS:</strong>{' '}
                QuickTime Player → File → Export As → 1080p
              </p>
              <code>ffmpeg -i your_video.mov -c:v libx264 -crf 23 output.mp4</code>
            </div>
            <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => {
              state.frames.forEach((f) => URL.revokeObjectURL(f.url))
              setState({
                file: null, duration: 0, videoMode: 'native',
                frames: [], markedFrames: [], extracting: false, progress: null,
                error: null, status: null, showFallbackHelp: false,
              })
              setTranscript({ status: 'idle', statusMsg: '', result: null, downloadProgress: null })
              setTranscriptEnabled(false)
              if (videoRef.current) videoRef.current.src = ''
            }}>
              Try another file
            </button>
          </div>
        )}

        {/* Workspace */}
        {hasVideo && (
          <Workspace
            file={state.file!}
            videoMode={state.videoMode}
            duration={state.duration}
            videoRef={videoRef as React.RefObject<HTMLVideoElement>}
            params={params}
            onParamsChange={setParams}
            extracting={state.extracting}
            progress={state.progress}
            onExtract={handleExtract}
            markedFrames={state.markedFrames}
            onMark={handleMark}
            onRemoveMark={handleRemoveMark}
            transcriptEnabled={transcriptEnabled}
            onTranscriptEnabledChange={handleTranscriptEnabledChange}
            transcriptLang={transcriptLang}
            onTranscriptLangChange={handleLanguageChange}
            onClearVideo={handleClearVideo}
          />
        )}

        {/* Frames + Transcript — tabbed */}
        <ResultsArea
          frames={state.frames}
          onClear={handleClear}
          transcriptStatus={transcript.status}
          transcriptMsg={transcript.statusMsg}
          transcriptResult={transcript.result}
          transcriptProgress={transcript.downloadProgress}
          filename={state.file?.name ?? ''}
          transcriptLang={transcriptLang}
          onTranscriptLangChange={handleLanguageChange}
        />

      </main>

      <footer>
        <div className="footer-left">
          Jorge Verlindo 2026
        </div>
        <div className="footer-right">
          <span className="footer-status"><span className="dot" /> All processing happens in your browser</span>
        </div>
      </footer>
    </>
  )
}

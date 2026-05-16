import { useRef, useState, useCallback } from 'react'
import { AlertCircle, Info } from 'lucide-react'
import Navbar from './components/Navbar'
import Dropzone from './components/Dropzone'
import Workspace from './components/Workspace'
import ResultsArea from './components/ResultsArea'
import type { Frame, ExtractionParams } from './lib/extractor'
import {
  buildTimestamps, extractNative, extractFFmpeg,
  loadFFmpeg, probeWithFFmpeg,
} from './lib/extractor'
import type { TranscriptStatus, TranscriptResult } from './lib/transcriber'
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

const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function footerDate() {
  const d = new Date()
  return `${months[d.getMonth()]} ${d.getFullYear()}`
}

export default function App() {
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
  const [transcript, setTranscript] = useState<{
    status: TranscriptStatus
    statusMsg: string
    result: TranscriptResult | null
    downloadProgress: number | null
  }>({ status: 'idle', statusMsg: '', result: null, downloadProgress: null })

  const patch = (partial: Partial<AppState>) => setState((s) => ({ ...s, ...partial }))

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

    const onReady = () => {
      if (settled || !probe.videoWidth) return
      settled = true
      cleanup()
      patch({ duration: probe.duration, videoMode: 'native', status: null })
      // Start transcription in background (non-blocking)
      setTranscript({ status: 'loading-model', statusMsg: 'Downloading model…', result: null, downloadProgress: null })
      transcribeFile(file, (status, msg, progress) => {
        setTranscript(prev => ({ ...prev, status, statusMsg: msg ?? '', downloadProgress: progress ?? null }))
      }).then(result => {
        setTranscript({ status: 'done', statusMsg: '', result, downloadProgress: null })
      }).catch(err => {
        setTranscript({ status: 'error', statusMsg: String(err instanceof Error ? err.message : err), result: null, downloadProgress: null })
      })
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
        // Start transcription in background (non-blocking)
        setTranscript({ status: 'loading-model', statusMsg: 'Downloading model…', result: null, downloadProgress: null })
        transcribeFile(file, (status, msg, progress) => {
          setTranscript(prev => ({ ...prev, status, statusMsg: msg ?? '', downloadProgress: progress ?? null }))
        }, ffmpegInstanceRef.current, ffmpegInputRef.current).then(result => {
          setTranscript({ status: 'done', statusMsg: '', result, downloadProgress: null })
        }).catch(err => {
          setTranscript({ status: 'error', statusMsg: String(err instanceof Error ? err.message : err), result: null, downloadProgress: null })
        })
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

  // ── Render ────────────────────────────────────────────────────────────────

  const hasVideo = !!state.file && state.duration > 0
  const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:'

  return (
    <>
      <Navbar />

      <main style={{ width: '80%', margin: '0 auto', padding: '40px 0 24px' }}>

        {/* Hero */}
        <header style={{ marginBottom: 32 }}>
          <h1>Video Slicer</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>
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
              <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>
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
              setTranscript({ status: 'idle', statusMsg: '', result: null })
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
        />

      </main>

      <footer>
        <div className="footer-left">
          <svg viewBox="0 0 32 32" width="14" height="14" fill="none">
            <path d="M2.22422 16.0471C2.22422 7.57204 8.61025 0.631495 16.6988 0.0413128C16.332 0.0118036 15.9594 0 15.5867 0C6.97648 0 0 7.18252 0 16.0471C0 24.9116 6.97648 32.0941 15.5867 32.0941C15.9594 32.0941 16.332 32.0823 16.6988 32.0528C8.61025 31.4626 2.22422 24.5221 2.22422 16.0471Z" fill="#686576"/>
            <path d="M6.12234 16.0471C6.12234 9.69079 10.909 4.48539 16.9797 4.04275C16.7046 4.02504 16.4237 4.01324 16.1428 4.01324C9.68797 4.01324 4.45417 9.4016 4.45417 16.0471C4.45417 22.6925 9.68797 28.0809 16.1428 28.0809C16.4237 28.0809 16.7046 28.0691 16.9797 28.0514C10.9147 27.6087 6.12234 22.4033 6.12234 16.0471Z" fill="#686576"/>
            <path d="M17.2606 8.04418C17.0772 8.03238 16.8938 8.02648 16.7046 8.02648C12.3995 8.02648 8.90834 11.6207 8.90834 16.053C8.90834 20.4852 12.3995 24.0794 16.7046 24.0794C16.8938 24.0794 17.0772 24.0735 17.2606 24.0558C13.2135 23.7607 10.0262 20.2905 10.0262 16.053C10.0262 11.8155 13.2192 8.34518 17.2606 8.05009V8.04418Z" fill="#686576"/>
          </svg>
          <span>A Constellation tool</span>
        </div>
        <div className="footer-right">
          <span className="footer-status"><span className="dot" /> All processing happens in your browser</span>
          <span>{footerDate()}</span>
        </div>
      </footer>
    </>
  )
}

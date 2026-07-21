import { useCallback, useEffect, useRef, useState } from 'react'
import { Sliders, Video, MapPin, X, ChevronDown, Check } from 'lucide-react'
import type { ExtractionParams, AspectRatio } from '../lib/extractor'
import { fmtDuration, fmtTimecode } from '../lib/extractor'
import type { MarkedFrame } from '../App'
import type { TranscriptLang, TranscriptStatus } from '../lib/transcript-types'

type VideoMode = 'native' | 'ffmpeg'

type Props = {
  file: File
  videoMode: VideoMode
  duration: number
  videoRef: React.RefObject<HTMLVideoElement>
  params: ExtractionParams
  onParamsChange: (p: ExtractionParams) => void
  aspectRatio: AspectRatio
  onAspectRatioChange: (r: AspectRatio) => void
  extracting: boolean
  progress: { done: number; total: number } | null
  onExtract: () => void
  onClearVideo: () => void
  markedFrames: MarkedFrame[]
  onMark: (timestamp: number, thumbnail: string) => void
  onRemoveMark: (id: number) => void
  transcriptEnabled: boolean
  onTranscriptEnabledChange: (v: boolean) => void
  transcriptLang: TranscriptLang | null
  onTranscriptLangChange: (lang: TranscriptLang) => void
  transcriptStatus: TranscriptStatus
  transcriptMsg: string
  transcriptProgress: number | null
}

function MarkFrameBtn({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      className="btn btn-secondary btn-block"
      style={{ marginBottom: 8, justifyContent: 'space-between' }}
      onClick={onClick}
      disabled={disabled}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <MapPin size={15} />
        Mark frame
      </span>
      <kbd style={{
        fontSize: 10, fontFamily: 'inherit',
        background: 'var(--border)', color: 'var(--text-secondary)',
        borderRadius: 4, padding: '1px 5px', fontWeight: 500, letterSpacing: 0.2,
      }}>⌥D</kbd>
    </button>
  )
}

export default function Workspace({
  file, videoMode, duration, videoRef,
  params, onParamsChange, aspectRatio, onAspectRatioChange,
  extracting, progress, onExtract, onClearVideo,
  markedFrames, onMark, onRemoveMark,
  transcriptEnabled, onTranscriptEnabledChange,
  transcriptLang, onTranscriptLangChange,
  transcriptStatus, transcriptMsg, transcriptProgress,
}: Props) {
  const [videoMeta, setVideoMeta] = useState('')
  const marksListRef = useRef<HTMLDivElement>(null)

  // Keep the newest mark in view as the list grows
  useEffect(() => {
    const el = marksListRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [markedFrames.length])

  // Load file into the video element when it mounts or file changes
  useEffect(() => {
    const v = videoRef.current
    if (!v || videoMode !== 'native') return
    const url = URL.createObjectURL(file)
    v.src = url
    return () => { v.src = ''; URL.revokeObjectURL(url) }
  }, [file, videoMode, videoRef])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const update = () => {
      if (v.videoWidth) {
        const mb = (file.size / 1024 / 1024).toFixed(1)
        setVideoMeta(`${v.videoWidth}×${v.videoHeight} · ${fmtDuration(v.duration)} · ${mb} MB`)
      }
    }
    v.addEventListener('loadedmetadata', update)
    v.addEventListener('loadeddata', update)
    if (v.readyState >= 1) update()
    return () => { v.removeEventListener('loadedmetadata', update); v.removeEventListener('loadeddata', update) }
  }, [file, videoRef])

  const mb = (file.size / 1024 / 1024).toFixed(1)
  const ffmpegMeta = `${file.name} · ${fmtDuration(duration)} · ${mb} MB · converter mode`

  const paramMetaLabel = params.mode === 'interval'
    ? `1 / ${params.interval}s`
    : params.mode === 'count'
    ? `${params.count} frames`
    : params.mode === 'storyboard'
    ? 'storyboard'
    : `${markedFrames.length} marked`

  const totalEstimate = params.mode === 'interval'
    ? Math.floor(duration / params.interval)
    : params.mode === 'count'
    ? params.count
    : markedFrames.length

  const extractLabel = extracting
    ? 'Extracting…'
    : params.mode === 'custom'
    ? markedFrames.length === 0
      ? 'Mark frames first'
      : `Extract ${markedFrames.length} marked frame${markedFrames.length !== 1 ? 's' : ''}`
    : params.mode === 'storyboard'
    ? transcriptStatus === 'done'
      ? 'Generate storyboard'
      : markedFrames.length > 0
      ? `Generate storyboard (${markedFrames.length} frame${markedFrames.length !== 1 ? 's' : ''})`
      : 'Mark frames to begin'
    : `Extract frames${totalEstimate > 0 ? ` (~${totalEstimate})` : ''}`

  const canExtract = !extracting && (
    params.mode === 'custom'
      ? markedFrames.length > 0
      : params.mode === 'storyboard'
      ? transcriptStatus === 'done' || markedFrames.length > 0
      : true
  )

  // ── Mark frame handler ────────────────────────────────────────────────────
  const handleMark = useCallback(() => {
    const v = videoRef.current
    if (!v || !isFinite(v.currentTime) || videoMode === 'ffmpeg') return
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 320 / (v.videoWidth || 320))
    canvas.width = Math.round((v.videoWidth || 320) * scale)
    canvas.height = Math.round((v.videoHeight || 180) * scale)
    canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height)
    onMark(v.currentTime, canvas.toDataURL('image/jpeg', 0.7))
  }, [videoRef, videoMode, onMark])

  // ── ⌥D keyboard shortcut — refs avoid stale closures in the mount-once listener
  const handleMarkRef = useRef(handleMark)
  handleMarkRef.current = handleMark
  const canMarkRef = useRef(false)
  canMarkRef.current =
    (params.mode === 'custom' || (params.mode === 'storyboard' && transcriptStatus !== 'done')) &&
    videoMode !== 'ffmpeg'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!canMarkRef.current) return
      if (!e.altKey || e.code !== 'KeyD') return   // e.code not e.key — Alt+D gives '∂' on Mac
      const t = e.target as HTMLElement
      if (t instanceof HTMLTextAreaElement) return
      if (t instanceof HTMLInputElement && t.type !== 'range') return
      e.preventDefault()
      handleMarkRef.current()
    }
    // capture:true — fires before native video shadow DOM consumes the event
    window.addEventListener('keydown', onKey, true)
    // Blur video on mouseup — removes focus from native scrubber so ⌥D fires after seeking
    const v = videoRef.current
    const onVideoMouseUp = () => videoRef.current?.blur()
    v?.addEventListener('mouseup', onVideoMouseUp)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      v?.removeEventListener('mouseup', onVideoMouseUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1.5fr 1fr',
      gap: 16,
      marginBottom: 24,
    }} className="workspace-grid">

      {/* ── Video card ── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Video size={16} style={{ opacity: 0.6 }} /> Source
          </span>
          <span className="card-meta">{videoMode === 'ffmpeg' ? ffmpegMeta : videoMeta || '—'}</span>
        </div>
        <div className="card-body">
          {videoMode === 'ffmpeg' ? (
            <div className="video-placeholder">
              <div className="video-placeholder-icon"><Video size={28} /></div>
              <div className="video-placeholder-text">Video ready for extraction</div>
              <div className="video-placeholder-caption">Preview unavailable in converter mode</div>
            </div>
          ) : (
            <video ref={videoRef} controls />
          )}
        </div>
      </div>

      {/* ── Parameters card ── */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sliders size={16} style={{ opacity: 0.6 }} /> Parameters
          </span>
          <span className="card-meta">{paramMetaLabel}</span>
        </div>
        <div className="card-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Sampling mode — 3 options */}
          <div className="field">
            <span className="field-label">Sampling mode</span>
            <div className="seg seg-compact" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
              <input type="radio" name="mode" id="mode-interval" value="interval"
                checked={params.mode === 'interval'}
                onChange={() => onParamsChange({ ...params, mode: 'interval' })} />
              <label htmlFor="mode-interval">Interval</label>

              <input type="radio" name="mode" id="mode-count" value="count"
                checked={params.mode === 'count'}
                onChange={() => onParamsChange({ ...params, mode: 'count' })} />
              <label htmlFor="mode-count">Fixed count</label>

              <input type="radio" name="mode" id="mode-custom" value="custom"
                checked={params.mode === 'custom'}
                onChange={() => onParamsChange({ ...params, mode: 'custom' })} />
              <label htmlFor="mode-custom">Custom</label>

              <input type="radio" name="mode" id="mode-storyboard" value="storyboard"
                checked={params.mode === 'storyboard'}
                onChange={() => onParamsChange({ ...params, mode: 'storyboard' })} />
              <label htmlFor="mode-storyboard">Storyboard</label>
            </div>
          </div>

          {/* Interval field */}
          {params.mode === 'interval' && (
            <div className="field">
              <span className="field-label">One frame every (seconds)</span>
              <input type="number" value={params.interval} min={0.1} step={0.1}
                onChange={(e) => onParamsChange({ ...params, interval: Math.max(0.1, parseFloat(e.target.value) || 1) })} />
            </div>
          )}

          {/* Fixed count field */}
          {params.mode === 'count' && (
            <div className="field">
              <span className="field-label">Total frames</span>
              <input type="number" value={params.count} min={1} max={500} step={1}
                onChange={(e) => onParamsChange({ ...params, count: Math.max(1, parseInt(e.target.value) || 20) })} />
            </div>
          )}

          {/* Storyboard mode — transcript ready banner */}
          {params.mode === 'storyboard' && transcriptStatus === 'done' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '12px 14px',
              background: 'var(--gray-100)', borderRadius: 'var(--radius-md)',
              fontSize: 12, color: 'var(--text-secondary)',
            }}>
              <Check size={14} style={{ color: '#16a34a', flexShrink: 0 }} />
              Transcript ready — frames will follow the transcript segments
            </div>
          )}

          {/* Custom mode + Storyboard without transcript — manual marking */}
          {(params.mode === 'custom' || (params.mode === 'storyboard' && transcriptStatus !== 'done')) && (
            <div className="field" style={{ marginBottom: 0 }}>
              <span className="field-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                {params.mode === 'storyboard' ? 'Mark storyboard frames' : 'Manual selection'}
                {markedFrames.length > 0 && (
                  <span style={{
                    fontSize: 11, textTransform: 'none', letterSpacing: 0,
                    color: 'var(--text-placeholder)',
                    fontFamily: 'JetBrains Mono, SF Mono, monospace',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {markedFrames.length} mark{markedFrames.length !== 1 ? 's' : ''}
                  </span>
                )}
              </span>

              <MarkFrameBtn onClick={handleMark} disabled={videoMode === 'ffmpeg'} />

              {/* Marks list */}
              {markedFrames.length === 0 ? (
                <div style={{
                  padding: '16px 12px', textAlign: 'center',
                  background: 'var(--gray-100)', borderRadius: 'var(--radius-md)',
                  fontSize: 12, color: 'var(--text-placeholder)',
                }}>
                  Scrub the video and click Mark frame
                </div>
              ) : (
                <div ref={marksListRef} style={{
                  maxHeight: 153, overflowY: 'auto',
                  display: 'flex', flexDirection: 'column', gap: 6,
                  paddingRight: 2,
                }}>
                  {markedFrames.map((m, idx) => (
                    <div key={m.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: 'var(--gray-100)', borderRadius: 'var(--radius-md)',
                      padding: '6px 8px',
                    }}>
                      {/* Thumbnail */}
                      <div style={{
                        width: 48, height: 27, flexShrink: 0,
                        borderRadius: 'var(--radius-xs)', overflow: 'hidden',
                        background: '#000',
                      }}>
                        <img src={m.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      </div>
                      {/* Index + timecode */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 10, color: 'var(--text-placeholder)',
                          fontFamily: 'JetBrains Mono, SF Mono, monospace',
                          letterSpacing: 0.3,
                        }}>
                          #{String(idx + 1).padStart(2, '0')}
                        </div>
                        <div style={{
                          fontSize: 11, color: 'var(--text-primary)', fontWeight: 500,
                          fontFamily: 'JetBrains Mono, SF Mono, monospace',
                          fontVariantNumeric: 'tabular-nums',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {fmtTimecode(m.timestamp)}
                        </div>
                      </div>
                      {/* Delete */}
                      <button
                        onClick={() => onRemoveMark(m.id)}
                        style={{
                          flexShrink: 0, width: 24, height: 24,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          color: 'var(--text-placeholder)', borderRadius: 'var(--radius-sm)',
                          transition: 'var(--t-fast)',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--destructive)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--destructive-bg)' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-placeholder)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ flex: 1, minHeight: 0 }} />

          {/* ── Audio Transcript opt-in ── */}
          <div style={{
            borderTop: '1px solid var(--border)',
            paddingTop: 16, marginBottom: 16, flexShrink: 0,
          }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 8,
              cursor: 'pointer', userSelect: 'none',
              marginBottom: transcriptEnabled ? 10 : 0,
            }}>
              <input
                type="checkbox"
                checked={transcriptEnabled}
                onChange={e => onTranscriptEnabledChange(e.target.checked)}
                style={{ accentColor: 'var(--brand)', width: 14, height: 14, flexShrink: 0 }}
              />
              <span style={{ fontSize: 14, fontWeight: 300, color: 'var(--text-primary)' }}>
                Audio Transcript
              </span>
            </label>

            {transcriptEnabled && (() => {
              const isActive = transcriptStatus !== 'idle' && transcriptStatus !== 'done' && transcriptStatus !== 'error'
              const isDownloading = transcriptStatus === 'loading-model' || transcriptStatus === 'loading-model-multilingual'
              const statusText = isDownloading && transcriptProgress != null
                ? `Downloading model… ${transcriptProgress}%`
                : transcriptMsg

              return (
                <div>
                  {/* Row: dropdown + status/hint */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, overflow: 'hidden' }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <select
                        value={transcriptLang ?? ''}
                        onChange={e => { if (e.target.value) onTranscriptLangChange(e.target.value as TranscriptLang) }}
                        style={{
                          height: 28, padding: '0 26px 0 10px',
                          fontSize: 12, fontFamily: 'inherit',
                          background: 'var(--gray-100)',
                          color: transcriptLang ? 'var(--text-primary)' : 'var(--text-placeholder)',
                          border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)',
                          cursor: 'pointer', outline: 'none', appearance: 'none',
                        }}
                      >
                        <option value="" disabled>Select language</option>
                        <option value="en">🇬🇧 English</option>
                        <option value="pt">🇧🇷 Portuguese</option>
                      </select>
                      <ChevronDown size={11} style={{
                        position: 'absolute', right: 8, top: '50%',
                        transform: 'translateY(-50%)', pointerEvents: 'none',
                        color: 'var(--text-secondary)',
                      }} />
                    </div>

                    {/* Inline spinner + message */}
                    {isActive && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
                        <div style={{
                          flexShrink: 0,
                          width: 14, height: 14, borderRadius: '50%',
                          border: '1.5px solid var(--border)',
                          borderTopColor: 'var(--brand)',
                          animation: 'spin 0.75s linear infinite',
                        }} />
                        <span style={{
                          fontSize: 14, fontWeight: 300,
                          fontFamily: "'Macklin Sans', 'DM Sans', sans-serif",
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {statusText}
                        </span>
                      </div>
                    )}

                    {/* ~460 MB hint */}
                    {!isActive && transcriptLang && transcriptLang !== 'en' && transcriptStatus === 'idle' && (
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', opacity: 0.7, flexShrink: 0 }}>
                        ~460 MB
                      </span>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* JPEG quality + Frame ratio — flexShrink: 0 keeps them anchored regardless of list height */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 24, marginTop: 16, flexShrink: 0 }}>
            <div className="field" style={{ flex: 1, minWidth: 0, marginBottom: 0 }}>
              <span className="field-label">JPEG quality</span>
              <div className="range-row">
                <input type="range" min={0.5} max={1} step={0.05} value={params.quality}
                  onChange={(e) => onParamsChange({ ...params, quality: parseFloat(e.target.value) })} />
                <span className="range-value">{params.quality.toFixed(2)}</span>
              </div>
            </div>
            {params.mode === 'storyboard' && (
              <div className="field" style={{ flexShrink: 0, marginBottom: 0 }}>
                <span className="field-label">Frame ratio</span>
                <div className="seg" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                  <input type="radio" name="aspect-ratio" id="ar-16-9" checked={aspectRatio === '16:9'} onChange={() => onAspectRatioChange('16:9')} />
                  <label htmlFor="ar-16-9" style={{ fontSize: 11, padding: '5px 4px' }}>16:9</label>
                  <input type="radio" name="aspect-ratio" id="ar-1-1" checked={aspectRatio === '1:1'} onChange={() => onAspectRatioChange('1:1')} />
                  <label htmlFor="ar-1-1" style={{ fontSize: 11, padding: '5px 4px' }}>1:1</label>
                  <input type="radio" name="aspect-ratio" id="ar-4-5" checked={aspectRatio === '4:5'} onChange={() => onAspectRatioChange('4:5')} />
                  <label htmlFor="ar-4-5" style={{ fontSize: 11, padding: '5px 4px' }}>4:5</label>
                  <input type="radio" name="aspect-ratio" id="ar-9-16" checked={aspectRatio === '9:16'} onChange={() => onAspectRatioChange('9:16')} />
                  <label htmlFor="ar-9-16" style={{ fontSize: 11, padding: '5px 4px' }}>9:16</label>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-secondary"
              style={{ flex: 1 }}
              onClick={onClearVideo}
              disabled={extracting}
            >
              Clear Video
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={!canExtract}
              onClick={onExtract}
            >
              {extractLabel}
            </button>
          </div>

          {progress && (
            <div className="progress" style={{ marginTop: 16 }}>
              <div className="progress-meta">
                <span>Processing</span>
                <span className="count">{progress.done} / {progress.total}</span>
              </div>
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

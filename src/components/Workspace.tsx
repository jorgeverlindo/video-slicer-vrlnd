import { useEffect, useState } from 'react'
import { Sliders, Video, MapPin, X, ChevronDown } from 'lucide-react'
import type { ExtractionParams } from '../lib/extractor'
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

export default function Workspace({
  file, videoMode, duration, videoRef,
  params, onParamsChange, extracting, progress, onExtract, onClearVideo,
  markedFrames, onMark, onRemoveMark,
  transcriptEnabled, onTranscriptEnabledChange,
  transcriptLang, onTranscriptLangChange,
  transcriptStatus, transcriptMsg, transcriptProgress,
}: Props) {
  const [videoMeta, setVideoMeta] = useState('')

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
    : `Extract frames${totalEstimate > 0 ? ` (~${totalEstimate})` : ''}`

  const canExtract = !extracting && (
    params.mode === 'custom' ? markedFrames.length > 0 : true
  )

  // ── Mark frame handler ────────────────────────────────────────────────────
  const handleMark = () => {
    const v = videoRef.current
    if (!v || !isFinite(v.currentTime)) return
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 320 / (v.videoWidth || 320))
    canvas.width = Math.round((v.videoWidth || 320) * scale)
    canvas.height = Math.round((v.videoHeight || 180) * scale)
    canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height)
    const thumbnail = canvas.toDataURL('image/jpeg', 0.7)
    onMark(v.currentTime, thumbnail)
  }

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
            <div className="seg" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
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

          {/* Custom mode */}
          {params.mode === 'custom' && (
            <div className="field" style={{ marginBottom: 0 }}>
              <span className="field-label">Manual selection</span>

              <button
                className="btn btn-secondary btn-block"
                style={{ marginBottom: 12 }}
                onClick={handleMark}
                disabled={videoMode === 'ffmpeg'}
              >
                <MapPin size={15} />
                Mark frame
              </button>

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
                <div style={{
                  maxHeight: 240, overflowY: 'auto',
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

          {/* JPEG quality — flexShrink: 0 keeps it anchored regardless of list height */}
          <div className="field" style={{ marginBottom: 24, marginTop: 16, flexShrink: 0 }}>
            <span className="field-label">JPEG quality</span>
            <div className="range-row">
              <input type="range" min={0.5} max={1} step={0.05} value={params.quality}
                onChange={(e) => onParamsChange({ ...params, quality: parseFloat(e.target.value) })} />
              <span className="range-value">{params.quality.toFixed(2)}</span>
            </div>
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

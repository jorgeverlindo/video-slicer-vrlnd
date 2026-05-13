import { useRef, useEffect, useState } from 'react'
import { Sliders, Video } from 'lucide-react'
import type { ExtractionParams } from '../lib/extractor'
import { fmtDuration } from '../lib/extractor'

type VideoMode = 'native' | 'ffmpeg'

type Props = {
  file: File
  videoMode: VideoMode
  duration: number
  videoRef: React.RefObject<HTMLVideoElement | null>
  params: ExtractionParams
  onParamsChange: (p: ExtractionParams) => void
  extracting: boolean
  progress: { done: number; total: number } | null
  onExtract: () => void
}

export default function Workspace({
  file, videoMode, duration, videoRef,
  params, onParamsChange, extracting, progress, onExtract,
}: Props) {
  const [videoMeta, setVideoMeta] = useState('')

  // Load the file into the video element when it mounts or file changes.
  // This is the single source of truth — App.tsx uses a temp probe element
  // for detection only, so videoRef always points to this loaded element.
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
    : `${params.count} frames`

  const totalEstimate = params.mode === 'interval'
    ? Math.floor(duration / params.interval)
    : params.count

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1.5fr 1fr',
      gap: 16,
      marginBottom: 24,
    }}>
      {/* ── Video card ── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Video size={13} style={{ opacity: 0.6 }} /> Source
          </span>
          <span className="card-meta">{videoMode === 'ffmpeg' ? ffmpegMeta : videoMeta || '—'}</span>
        </div>
        <div className="card-body">
          {videoMode === 'ffmpeg' ? (
            <div className="video-placeholder">
              <div className="video-placeholder-icon">
                <Video size={28} />
              </div>
              <div className="video-placeholder-text">Video ready for extraction</div>
              <div className="video-placeholder-caption">Preview unavailable in converter mode</div>
            </div>
          ) : (
            <video ref={videoRef as React.RefObject<HTMLVideoElement>} controls />
          )}
        </div>
      </div>

      {/* ── Parameters card ── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sliders size={13} style={{ opacity: 0.6 }} /> Parameters
          </span>
          <span className="card-meta">{paramMetaLabel}</span>
        </div>
        <div className="card-body">

          <div className="field">
            <span className="field-label">Sampling mode</span>
            <div className="seg">
              <input type="radio" name="mode" id="mode-interval" value="interval"
                checked={params.mode === 'interval'}
                onChange={() => onParamsChange({ ...params, mode: 'interval' })} />
              <label htmlFor="mode-interval">By interval</label>
              <input type="radio" name="mode" id="mode-count" value="count"
                checked={params.mode === 'count'}
                onChange={() => onParamsChange({ ...params, mode: 'count' })} />
              <label htmlFor="mode-count">Fixed count</label>
            </div>
          </div>

          {params.mode === 'interval' ? (
            <div className="field">
              <span className="field-label">One frame every (seconds)</span>
              <input type="number" value={params.interval} min={0.1} step={0.1}
                onChange={(e) => onParamsChange({ ...params, interval: Math.max(0.1, parseFloat(e.target.value) || 1) })} />
            </div>
          ) : (
            <div className="field">
              <span className="field-label">Total frames</span>
              <input type="number" value={params.count} min={1} max={500} step={1}
                onChange={(e) => onParamsChange({ ...params, count: Math.max(1, parseInt(e.target.value) || 20) })} />
            </div>
          )}

          <div className="field" style={{ marginBottom: 24 }}>
            <span className="field-label">JPEG quality</span>
            <div className="range-row">
              <input type="range" min={0.5} max={1} step={0.05} value={params.quality}
                onChange={(e) => onParamsChange({ ...params, quality: parseFloat(e.target.value) })} />
              <span className="range-value">{params.quality.toFixed(2)}</span>
            </div>
          </div>

          <button
            className="btn btn-primary btn-block"
            disabled={extracting}
            onClick={onExtract}
            style={{ marginBottom: progress ? 0 : undefined }}
          >
            {extracting ? 'Extracting…' : `Extract frames${totalEstimate > 0 ? ` (~${totalEstimate})` : ''}`}
          </button>

          {progress && (
            <div className="progress" style={{ marginTop: 16 }}>
              <div className="progress-meta">
                <span>Processing</span>
                <span className="count">{progress.done} / {progress.total}</span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

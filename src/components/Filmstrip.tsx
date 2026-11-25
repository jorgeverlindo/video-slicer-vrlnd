import { useEffect, useRef, useState } from 'react'
import { fmtDuration } from '../lib/extractor'
import { useVideoTime } from './Player'

/**
 * Thumbnails for the scrubber, decoded off a second, hidden video so the
 * visible player never jumps. Sequential seeks, 160px wide canvases.
 */
export function useThumbs(file: File | null, duration: number, count = 12, enabled = true) {
  const [thumbs, setThumbs] = useState<string[]>([])
  useEffect(() => {
    if (!file || !duration || !enabled) { setThumbs([]); return }
    let alive = true
    const v = document.createElement('video')
    v.muted = true; v.preload = 'auto'; v.playsInline = true
    const url = URL.createObjectURL(file)
    v.src = url
    const canvas = document.createElement('canvas')
    const out: string[] = []
    const seek = (t: number) => new Promise<void>((res, rej) => {
      const done = () => { v.removeEventListener('seeked', done); res() }
      v.addEventListener('seeked', done)
      v.addEventListener('error', () => rej(new Error('thumb')), { once: true })
      v.currentTime = t
    })
    ;(async () => {
      await new Promise<void>((res) => v.addEventListener('loadeddata', () => res(), { once: true }))
      const w = 160
      const h = Math.round(w * (v.videoHeight / v.videoWidth || 9 / 16))
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')!
      for (let i = 0; i < count && alive; i++) {
        await seek(((i + 0.5) / count) * duration)
        ctx.drawImage(v, 0, 0, w, h)
        out.push(canvas.toDataURL('image/jpeg', 0.6))
        if (alive) setThumbs([...out])
      }
    })().catch(() => { /* thumbnails are decoration; keep what we have */ })
    return () => { alive = false; v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url) }
  }, [file, duration, count, enabled])
  return thumbs
}

export type Marker = { t: number; kind: 'tick' | 'pin'; label?: string }

type Props = {
  duration: number
  thumbs: string[]
  videoRef: React.RefObject<HTMLVideoElement>
  markers?: Marker[]
  disabled?: boolean
}

// One scrubber, one playhead: dragging anywhere on the strip seeks the video.
// The pointer is captured, so a drag never cancels when it leaves the strip.
export default function Filmstrip({ duration, thumbs, videoRef, markers = [], disabled }: Props) {
  const strip = useRef<HTMLDivElement>(null)
  const { t } = useVideoTime(videoRef)
  const pct = duration ? Math.min(1, t / duration) : 0
  const slots = Math.max(thumbs.length, 12)

  const seekAt = (clientX: number) => {
    const el = strip.current, v = videoRef.current
    if (!el || !v || !duration) return
    const r = el.getBoundingClientRect()
    v.currentTime = Math.max(0, Math.min(duration - 0.01, ((clientX - r.left) / r.width) * duration))
  }

  const [dragging, setDragging] = useState(false)
  const endDrag = () => setDragging(false)
  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    videoRef.current?.pause()
    seekAt(e.clientX)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) seekAt(e.clientX)
  }
  const onKey = (e: React.KeyboardEvent) => {
    const v = videoRef.current
    if (!v) return
    if (e.key === 'ArrowLeft') { e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 1) }
    if (e.key === 'ArrowRight') { e.preventDefault(); v.currentTime = Math.min(duration, v.currentTime + 1) }
  }

  // Ticks thin out so they never crowd below ~6px apart
  const ticks = markers.filter((m) => m.kind === 'tick')
  const every = Math.max(1, Math.ceil(ticks.length / 80))

  return (
    <div className="filmstrip" data-disabled={disabled || undefined}>
      {/* Ruler + strip are one hit area; the playhead lives outside the
          clipped strip so its knob can stand above the ruler */}
      <div
        ref={strip} className="filmstrip__track" role="slider" tabIndex={disabled ? -1 : 0}
        data-dragging={dragging || undefined}
        aria-label="Scrub through the video" aria-valuemin={0} aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(t)} aria-valuetext={fmtDuration(t)}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={onKey}
      >
        <div className="filmstrip__marks" aria-hidden="true">
          {ticks.filter((_, i) => i % every === 0).map((m, i) => (
            <span key={`t${i}`} className="filmstrip__tick" style={{ left: `${(m.t / duration) * 100}%` }} />
          ))}
          {markers.filter((m) => m.kind === 'pin').map((m, i) => (
            <span key={`p${i}`} className="filmstrip__pin t-label-s" style={{ left: `${(m.t / duration) * 100}%` }}>{m.label}</span>
          ))}
        </div>
        <div className="filmstrip__strip">
          {Array.from({ length: slots }, (_, i) => (
            <span key={i} className="filmstrip__cell">
              {thumbs[i] && <img src={thumbs[i]} alt="" draggable={false} />}
            </span>
          ))}
          {markers.filter((m) => m.kind === 'pin').map((m, i) => (
            <span key={`l${i}`} className="filmstrip__pinline" style={{ left: `${(m.t / duration) * 100}%` }} aria-hidden="true" />
          ))}
        </div>
        <span className="filmstrip__head" style={{ left: `${pct * 100}%` }} aria-hidden="true" />
      </div>
      <div className="filmstrip__labels t-mono-s c-subtle">
        <span>{fmtDuration(0)}</span><span>{fmtDuration(duration)}</span>
      </div>
    </div>
  )
}

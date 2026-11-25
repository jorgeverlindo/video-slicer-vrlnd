import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { PlayFilledAlt, PauseFilled, VolumeUp, VolumeMute, Maximize } from '@carbon/icons-react'
import { fmtTimecode } from '../lib/extractor'

/** Current time of a video, smooth while playing (rAF), event-driven when paused. */
export function useVideoTime(videoRef: React.RefObject<HTMLVideoElement>) {
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    let raf = 0
    const loop = () => { setT(v.currentTime); raf = requestAnimationFrame(loop) }
    const onPlay = () => { setPlaying(true); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop) }
    const onPause = () => { setPlaying(false); cancelAnimationFrame(raf); setT(v.currentTime) }
    const onSeek = () => setT(v.currentTime)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('ended', onPause)
    v.addEventListener('seeked', onSeek)
    v.addEventListener('timeupdate', onSeek)
    v.addEventListener('loadedmetadata', onSeek)
    return () => {
      cancelAnimationFrame(raf)
      v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause)
      v.removeEventListener('ended', onPause); v.removeEventListener('seeked', onSeek)
      v.removeEventListener('timeupdate', onSeek); v.removeEventListener('loadedmetadata', onSeek)
    }
  }, [videoRef])
  return { t, playing }
}

type Props = {
  file: File
  videoRef: React.RefObject<HTMLVideoElement>
  duration: number
  /** Floating control over the picture, e.g. "Mark this frame" */
  overlay?: ReactNode
}

export default function Player({ file, videoRef, duration, overlay }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const [muted, setMuted] = useState(false)
  const { t, playing } = useVideoTime(videoRef)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const url = URL.createObjectURL(file)
    v.src = url
    return () => { v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url) }
  }, [file, videoRef])

  const toggle = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play(); else v.pause()
  }, [videoRef])

  const seekBy = (d: number) => {
    const v = videoRef.current
    if (v) v.currentTime = Math.max(0, Math.min(v.duration || duration, v.currentTime + d))
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle() }
    if (e.key === 'ArrowLeft') { e.preventDefault(); seekBy(e.shiftKey ? -1 : -1 / 30) }
    if (e.key === 'ArrowRight') { e.preventDefault(); seekBy(e.shiftKey ? 1 : 1 / 30) }
  }

  return (
    <div
      ref={wrap} className="player" tabIndex={0} onKeyDown={onKey}
      aria-label="Video player. Space plays or pauses, arrows step one frame, Shift and arrows jump one second."
    >
      <video ref={videoRef} className="player__video" playsInline muted={muted} preload="auto" onClick={toggle} />
      <div className="player__scrim" aria-hidden="true" />
      {overlay && <div className="player__overlay">{overlay}</div>}
      <div className="player__controls">
        <button type="button" className="player__play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <PauseFilled size={16} /> : <PlayFilledAlt size={16} />}
        </button>
        <span className="t-mono-m player__time">
          {fmtTimecode(t)} <span className="player__dur">/ {fmtTimecode(duration)}</span>
        </span>
        <span className="player__spacer" />
        <button type="button" className="icon-btn player__icon" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Unmute' : 'Mute'}>
          {muted ? <VolumeMute size={16} /> : <VolumeUp size={16} />}
        </button>
        <button type="button" className="icon-btn player__icon" onClick={() => void wrap.current?.requestFullscreen?.()} aria-label="Full screen">
          <Maximize size={16} />
        </button>
      </div>
    </div>
  )
}

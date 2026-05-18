export type Frame = {
  index: number
  timestamp: number
  blob: Blob
  url: string
}

export type ExtractionParams = {
  mode: 'interval' | 'count' | 'custom'
  interval: number
  count: number
  quality: number
}

export type ExtractionMode = 'native' | 'ffmpeg'

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isFinite(video.duration) || video.readyState < 1) {
      reject(new Error('Video not ready. Make sure the video is fully loaded before extracting.'))
      return
    }
    const timer = setTimeout(() => {
      video.removeEventListener('seeked', onSeeked)
      reject(new Error(`Seek to ${time.toFixed(2)}s timed out — try a different video format.`))
    }, 10_000)
    const onSeeked = () => {
      clearTimeout(timer)
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
    video.addEventListener('seeked', onSeeked)
    video.currentTime = Math.min(Math.max(0, time), video.duration - 0.01)
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
      'image/jpeg',
      quality
    )
  })
}

export function buildTimestamps(duration: number, params: ExtractionParams): number[] {
  if (params.mode === 'interval') {
    const step = Math.max(0.1, params.interval)
    const timestamps: number[] = []
    for (let t = 0; t < duration; t += step) timestamps.push(t)
    return timestamps
  } else {
    const n = Math.max(1, params.count)
    if (n === 1) return [duration / 2]
    const step = duration / n
    return Array.from({ length: n }, (_, i) => i * step + step / 2)
  }
}

export async function* extractNative(
  video: HTMLVideoElement,
  timestamps: number[],
  quality: number
): AsyncGenerator<Frame> {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')!

  for (let i = 0; i < timestamps.length; i++) {
    await seekTo(video, timestamps[i])
    // Small delay to ensure frame is painted after seek
    await new Promise((r) => setTimeout(r, 40))
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await canvasToBlob(canvas, quality)
    yield { index: i + 1, timestamp: timestamps[i], blob, url: URL.createObjectURL(blob) }
  }
}

// ── FFmpeg path ──────────────────────────────────────────────────────────────

let ffmpegInstance: import('@ffmpeg/ffmpeg').FFmpeg | null = null

export async function loadFFmpeg(
  onProgress?: (msg: string) => void
): Promise<import('@ffmpeg/ffmpeg').FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance

  if (window.location.protocol === 'file:') {
    throw new Error('file:// protocol detected — serve via http(s) for FFmpeg support.')
  }

  onProgress?.('Loading universal converter (~30 MB, first time only)…')

  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const { toBlobURL } = await import('@ffmpeg/util')

  const ff = new FFmpeg()
  const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd'
  const [coreURL, wasmURL] = await Promise.all([
    toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
    toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
  ])
  await ff.load({ coreURL, wasmURL })
  ffmpegInstance = ff
  return ff
}

export async function probeWithFFmpeg(
  ff: import('@ffmpeg/ffmpeg').FFmpeg,
  file: File,
  onProgress?: (msg: string) => void
): Promise<{ duration: number; inputName: string }> {
  const { fetchFile } = await import('@ffmpeg/util')
  onProgress?.('Analyzing video…')

  const ext = (file.name.match(/\.[^.]+$/) || ['.mp4'])[0]
  const inputName = 'input' + ext
  await ff.writeFile(inputName, await fetchFile(file))

  let duration = 0
  const logHandler = ({ message }: { message: string }) => {
    const m = message?.match(/Duration:\s*(\d+):(\d+):([\d.]+)/)
    if (m) duration = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3])
  }
  ff.on('log', logHandler)
  try { await ff.exec(['-i', inputName, '-f', 'null', '-']) } catch (_) { /* expected */ }
  ff.off('log', logHandler)

  if (!duration || !isFinite(duration)) throw new Error('Could not read video duration.')
  return { duration, inputName }
}

export async function* extractFFmpeg(
  ff: import('@ffmpeg/ffmpeg').FFmpeg,
  inputName: string,
  timestamps: number[],
  quality: number
): AsyncGenerator<Frame> {
  // FFmpeg qscale: 2 = best, 31 = worst. Map quality [0.5–1] → qscale [26–2]
  const qScale = Math.round((1 - quality) * 26 + 2)

  for (let i = 0; i < timestamps.length; i++) {
    const outName = `out_${i}.jpg`
    await ff.exec([
      '-ss', String(timestamps[i]),
      '-i', inputName,
      '-frames:v', '1',
      '-q:v', String(qScale),
      '-y', outName,
    ])
    const data = await ff.readFile(outName)
    const blob = new Blob([data instanceof Uint8Array ? data.buffer : data], { type: 'image/jpeg' })
    try { await ff.deleteFile(outName) } catch (_) { /* ignore */ }
    yield { index: i + 1, timestamp: timestamps[i], blob, url: URL.createObjectURL(blob) }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`
}

export function fmtTimecode(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const ms = Math.floor((s % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

export type Frame = {
  index: number
  timestamp: number
  blob: Blob
  url: string
}

export type ExtractionParams = {
  mode: 'interval' | 'count' | 'custom' | 'storyboard'
  interval: number
  count: number
  quality: number
  uniqueOnly: boolean
}

export type AspectRatio = '16:9' | '1:1' | '4:5' | '9:16'

// Height as a fraction of width, per ratio — drives thumbnail + PDF layout
export const ASPECT_RATIO_H: Record<AspectRatio, number> = {
  '16:9': 9 / 16,
  '1:1': 1,
  '4:5': 5 / 4,
  '9:16': 16 / 9,
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

// ── Unique-frame detection ───────────────────────────────────────────────────
// Frames are compared on a 32×18 grayscale thumbnail against the last KEPT
// frame. Mean absolute pixel difference below UNIQUE_THRESHOLD (2% of full
// scale) marks a duplicate — it is skipped before the costly JPEG encode.

const THUMB_W = 32
const THUMB_H = 18
export const UNIQUE_THRESHOLD = 0.02

export function makeUniqueDetector() {
  const canvas = document.createElement('canvas')
  canvas.width = THUMB_W
  canvas.height = THUMB_H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  let prev: Float32Array | null = null

  return {
    isUnique(source: CanvasImageSource): boolean {
      ctx.drawImage(source, 0, 0, THUMB_W, THUMB_H)
      const rgba = ctx.getImageData(0, 0, THUMB_W, THUMB_H).data
      const gray = new Float32Array(THUMB_W * THUMB_H)
      for (let i = 0; i < gray.length; i++) {
        const j = i * 4
        gray[i] = rgba[j] * 0.299 + rgba[j + 1] * 0.587 + rgba[j + 2] * 0.114
      }
      if (!prev) { prev = gray; return true }
      let sum = 0
      for (let i = 0; i < gray.length; i++) sum += Math.abs(gray[i] - prev[i])
      if (sum / gray.length / 255 > UNIQUE_THRESHOLD) { prev = gray; return true }
      return false
    },
  }
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
  quality: number,
  uniqueOnly = false,
  onScan?: (scanned: number) => void
): AsyncGenerator<Frame> {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')!
  const detector = uniqueOnly ? makeUniqueDetector() : null
  let kept = 0

  for (let i = 0; i < timestamps.length; i++) {
    await seekTo(video, timestamps[i])
    // createImageBitmap is async — captures the decoded frame without blocking
    // the main thread on a GPU pipeline sync (which ctx.drawImage does synchronously).
    const bitmap = await createImageBitmap(video)
    // Duplicate check runs on the bitmap BEFORE the full-res draw + JPEG encode,
    // so skipped frames cost almost nothing.
    if (detector && !detector.isUnique(bitmap)) {
      bitmap.close()
      onScan?.(i + 1)
      continue
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await canvasToBlob(canvas, quality)
    kept++
    onScan?.(i + 1)
    yield { index: kept, timestamp: timestamps[i], blob, url: URL.createObjectURL(blob) }
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
  quality: number,
  uniqueOnly = false,
  onScan?: (scanned: number) => void
): AsyncGenerator<Frame> {
  // FFmpeg qscale: 2 = best, 31 = worst. Map quality [0.5–1] → qscale [26–2]
  const qScale = Math.round((1 - quality) * 26 + 2)
  const detector = uniqueOnly ? makeUniqueDetector() : null
  let kept = 0

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
    // FFmpeg emits ready-made JPEGs — decode to compare against the last kept frame
    if (detector) {
      const bitmap = await createImageBitmap(blob)
      const unique = detector.isUnique(bitmap)
      bitmap.close()
      if (!unique) { onScan?.(i + 1); continue }
    }
    kept++
    onScan?.(i + 1)
    yield { index: kept, timestamp: timestamps[i], blob, url: URL.createObjectURL(blob) }
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

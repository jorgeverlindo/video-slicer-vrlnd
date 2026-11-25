import type { TranscriptResult, TranscriptLang, OnStatusFn } from './transcript-types'
import { TRANSCRIPT_LANGUAGES } from './transcript-types'
import type { AsrRequest, AsrReply } from './asr.worker'

// Re-export so existing imports from './transcriber' continue to work
export type { TranscriptChunk, TranscriptResult, TranscriptStatus, TranscriptLang, OnStatusFn } from './transcript-types'
export { TRANSCRIPT_LANGUAGES, transcriptToMarkdown } from './transcript-types'

// ── Worker ────────────────────────────────────────────────────────────────
// Inference runs in asr.worker.ts so the page stays responsive. Audio is
// decoded here (AudioContext and the FFmpeg instance live on the page) and
// handed over as raw samples.
let worker: Worker | null = null
let nextId = 0
type NewRequest = AsrRequest extends infer R ? R extends AsrRequest ? Omit<R, 'id'> : never : never
const waiting = new Map<number, { onReply: (m: AsrReply) => void }>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./asr.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<AsrReply>) => waiting.get(e.data.id)?.onReply(e.data)
  return worker
}

function ask<T extends AsrReply['type']>(req: NewRequest, done: T, onProgress?: (pct: number | null) => void, transfer: Transferable[] = []): Promise<Extract<AsrReply, { type: T }>> {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    waiting.set(id, {
      onReply: (m) => {
        if (m.type === 'progress') { onProgress?.(m.pct); return }
        waiting.delete(id)
        if (m.type === 'error') reject(new Error(m.message))
        else if (m.type === done) resolve(m as Extract<AsrReply, { type: T }>)
      },
    })
    getWorker().postMessage({ ...req, id } as AsrRequest, transfer)
  })
}

async function extractSamples(
  file: File,
  ffmpegInstance?: import('@ffmpeg/ffmpeg').FFmpeg | null,
  ffmpegInputName?: string | null,
): Promise<Float32Array> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const ctx = new AudioContext({ sampleRate: 16_000 })
    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      return audioBuffer.getChannelData(0)
    } finally { ctx.close() }
  } catch {
    if (!ffmpegInstance || !ffmpegInputName)
      throw new Error('Cannot decode audio from this video format. Try an MP4 or WebM file.')
    await ffmpegInstance.exec(['-i', ffmpegInputName, '-vn', '-ar', '16000', '-ac', '1', '-f', 'wav', 'audio_out.wav'])
    const data = await ffmpegInstance.readFile('audio_out.wav')
    try { await ffmpegInstance.deleteFile('audio_out.wav') } catch { /* ignore */ }
    const wavBuffer = data instanceof Uint8Array ? data.buffer : data as ArrayBuffer
    const ctx = new AudioContext({ sampleRate: 16_000 })
    try {
      const audioBuffer = await ctx.decodeAudioData(wavBuffer)
      return audioBuffer.getChannelData(0)
    } finally { ctx.close() }
  }
}

// ── Main entry point ──────────────────────────────────────────────────────
export async function transcribeFile(
  file: File,
  onStatus: OnStatusFn,
  ffmpegInstance?: import('@ffmpeg/ffmpeg').FFmpeg | null,
  ffmpegInputName?: string | null,
  language: TranscriptLang = 'en',
): Promise<TranscriptResult> {

  const langMeta = TRANSCRIPT_LANGUAGES.find(l => l.code === language)!
  const useSmall = langMeta.model === 'small'
  const model = useSmall ? 'Xenova/whisper-small' : 'Xenova/whisper-tiny'
  const status = useSmall ? 'loading-model-multilingual' : 'loading-model'
  const label = useSmall ? `Loading ${langMeta.flag} ${langMeta.label} model…` : 'Downloading model…'

  // Load (or reuse) the model in the worker
  onStatus(status, label, null)
  const { cached } = await ask({ type: 'load', model }, 'loaded', (pct) => onStatus(status, label, pct))
  if (cached) onStatus('model-cached', useSmall ? 'Enhanced model ready' : 'Model ready')

  // Decode audio
  onStatus('decoding-audio', 'Decoding audio…')
  const samples = await extractSamples(file, ffmpegInstance, ffmpegInputName)

  // Transcribe, off the main thread
  onStatus('transcribing', `Transcribing in ${langMeta.label}…`)
  const own = samples.slice() // detach a copy so it can be transferred, not cloned
  const { result } = await ask({ type: 'run', model, samples: own, language }, 'result', undefined, [own.buffer])

  onStatus('done')
  return { ...(result as TranscriptResult), language: langMeta.label.toLowerCase() }
}



import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false

export type TranscriptChunk  = { timestamp: [number, number]; text: string }
export type TranscriptResult = { text: string; chunks: TranscriptChunk[]; language?: string }
export type TranscriptStatus =
  | 'idle'
  | 'loading-model'
  | 'model-cached'
  | 'loading-model-multilingual'
  | 'decoding-audio'
  | 'transcribing'
  | 'done'
  | 'error'

export type OnStatusFn = (status: TranscriptStatus, msg?: string, progress?: number | null) => void

// Language options exposed to the UI
export const TRANSCRIPT_LANGUAGES = [
  { code: 'en', label: 'English',    flag: '🇬🇧', model: 'tiny'  },
  { code: 'pt', label: 'Portuguese', flag: '🇧🇷', model: 'small' },
  { code: 'es', label: 'Spanish',    flag: '🇪🇸', model: 'small' },
  { code: 'fr', label: 'French',     flag: '🇫🇷', model: 'small' },
  { code: 'de', label: 'German',     flag: '🇩🇪', model: 'small' },
  { code: 'it', label: 'Italian',    flag: '🇮🇹', model: 'small' },
  { code: 'ja', label: 'Japanese',   flag: '🇯🇵', model: 'small' },
  { code: 'zh', label: 'Chinese',    flag: '🇨🇳', model: 'small' },
] as const

export type TranscriptLang = typeof TRANSCRIPT_LANGUAGES[number]['code']

// ── Model cache ───────────────────────────────────────────────────────────
let asrTiny:  Awaited<ReturnType<typeof pipeline>> | null = null
let asrSmall: Awaited<ReturnType<typeof pipeline>> | null = null

function makeProgressCallback(onStatus: OnStatusFn, status: TranscriptStatus, label: string) {
  const fileSizes = new Map<string, number>()
  const fileLoaded = new Map<string, number>()
  return (p: any) => {
    if (p.status === 'progress' && p.file) {
      if (p.total)  fileSizes.set(p.file, p.total)
      if (p.loaded) fileLoaded.set(p.file, p.loaded)
      const total  = [...fileSizes.values()].reduce((a, b) => a + b, 0)
      const loaded = [...fileLoaded.values()].reduce((a, b) => a + b, 0)
      const pct = total > 0 ? Math.round((loaded / total) * 100) : null
      onStatus(status, label, pct)
    }
  }
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

  if (useSmall) {
    // ── Non-English: load whisper-small ────────────────────────────────────
    if (asrSmall) {
      onStatus('model-cached', 'Enhanced model ready')
    } else {
      onStatus('loading-model-multilingual', `Loading ${langMeta.flag} ${langMeta.label} model…`, null)
      asrSmall = await pipeline(
        'automatic-speech-recognition',
        'Xenova/whisper-small',
        { dtype: 'fp32', progress_callback: makeProgressCallback(onStatus, 'loading-model-multilingual', `Loading ${langMeta.flag} ${langMeta.label} model…`) },
      )
    }
  } else {
    // ── English: load whisper-tiny ─────────────────────────────────────────
    if (asrTiny) {
      onStatus('model-cached', 'Model ready')
    } else {
      onStatus('loading-model', 'Downloading model…', null)
      asrTiny = await pipeline(
        'automatic-speech-recognition',
        'Xenova/whisper-tiny',
        { dtype: 'fp32', progress_callback: makeProgressCallback(onStatus, 'loading-model', 'Downloading model…') },
      )
    }
  }

  const asr = useSmall ? asrSmall! : asrTiny!

  // Decode audio
  onStatus('decoding-audio', 'Decoding audio…')
  const samples = await extractSamples(file, ffmpegInstance, ffmpegInputName)

  // Transcribe
  onStatus('transcribing', `Transcribing in ${langMeta.label}…`)
  const result = await (asr as any)(samples, {
    task: 'transcribe',
    language,
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true,
  })

  onStatus('done')
  return { ...(result as TranscriptResult), language: langMeta.label.toLowerCase() }
}

export function transcriptToMarkdown(result: TranscriptResult, filename: string): string {
  const langLine = result.language
    ? `**Language:** ${result.language.charAt(0).toUpperCase() + result.language.slice(1)}\n\n`
    : ''
  const lines = [
    `# Transcript — ${filename}`, '',
    langLine,
  ]
  for (const chunk of result.chunks ?? []) {
    const [s, e] = chunk.timestamp
    lines.push(`**${fmtTime(s)} → ${fmtTime(e)}**  `)
    lines.push(chunk.text.trim())
    lines.push('')
  }
  // Fallback: no chunks, just plain text
  if ((result.chunks ?? []).length === 0) {
    lines.push(result.text.trim())
  }
  return lines.join('\n')
}

function fmtTime(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function pad(n: number) { return String(n).padStart(2, '0') }
void pad

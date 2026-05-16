import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false

export type TranscriptChunk  = { timestamp: [number, number]; text: string }
export type TranscriptResult = { text: string; chunks: TranscriptChunk[]; language?: string }
export type TranscriptStatus =
  | 'idle'
  | 'loading-model'
  | 'model-cached'
  | 'detecting-language'
  | 'loading-model-multilingual'
  | 'decoding-audio'
  | 'transcribing'
  | 'done'
  | 'error'

export type OnStatusFn = (status: TranscriptStatus, msg?: string, progress?: number | null) => void

// ── Model cache ───────────────────────────────────────────────────────────
let asrTiny:  Awaited<ReturnType<typeof pipeline>> | null = null
let asrSmall: Awaited<ReturnType<typeof pipeline>> | null = null

// ── Progress tracker helper ───────────────────────────────────────────────
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

// ── Audio extraction helper ───────────────────────────────────────────────
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
    } finally {
      ctx.close()
    }
  } catch {
    if (!ffmpegInstance || !ffmpegInputName) {
      throw new Error('Cannot decode audio from this video format. Try an MP4 or WebM file.')
    }
    await ffmpegInstance.exec(['-i', ffmpegInputName, '-vn', '-ar', '16000', '-ac', '1', '-f', 'wav', 'audio_out.wav'])
    const data = await ffmpegInstance.readFile('audio_out.wav')
    try { await ffmpegInstance.deleteFile('audio_out.wav') } catch { /* ignore */ }
    const wavBuffer = data instanceof Uint8Array ? data.buffer : data as ArrayBuffer
    const ctx = new AudioContext({ sampleRate: 16_000 })
    try {
      const audioBuffer = await ctx.decodeAudioData(wavBuffer)
      return audioBuffer.getChannelData(0)
    } finally {
      ctx.close()
    }
  }
}

// ── Main entry point ──────────────────────────────────────────────────────
export async function transcribeFile(
  file: File,
  onStatus: OnStatusFn,
  ffmpegInstance?: import('@ffmpeg/ffmpeg').FFmpeg | null,
  ffmpegInputName?: string | null,
): Promise<TranscriptResult> {

  // ── 1. Load whisper-tiny (always — small, fast, used for detection + English) ──
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

  // ── 2. Decode audio ───────────────────────────────────────────────────────
  onStatus('decoding-audio', 'Decoding audio…')
  const samples = await extractSamples(file, ffmpegInstance, ffmpegInputName)

  // ── 3. Language detection on first 30 s ──────────────────────────────────
  onStatus('detecting-language', 'Detecting language…')
  const DETECT_SAMPLES = Math.min(samples.length, 30 * 16_000) // 30 s @ 16 kHz
  const shortSample = samples.slice(0, DETECT_SAMPLES)

  const detectionRaw = await (asrTiny as any)(shortSample, {
    task: 'transcribe',
    return_timestamps: false,
    // No language → Whisper auto-detects and returns `language` in result
  })
  const detectedLanguage: string = (detectionRaw as any).language ?? 'english'

  // ── 4. Branch: English → tiny  |  Everything else → small ───────────────
  let asr: Awaited<ReturnType<typeof pipeline>>
  let transcribeLanguage: string | undefined

  if (detectedLanguage === 'english') {
    asr = asrTiny
    // English: tiny is great, no extra download needed
  } else {
    // Non-English: upgrade to whisper-small
    if (asrSmall) {
      onStatus('model-cached', `${formatLanguage(detectedLanguage)} detected — enhanced model ready`)
    } else {
      onStatus(
        'loading-model-multilingual',
        `${formatLanguage(detectedLanguage)} detected — downloading enhanced model…`,
        null,
      )
      asrSmall = await pipeline(
        'automatic-speech-recognition',
        'Xenova/whisper-small',
        {
          dtype: 'fp32',
          progress_callback: makeProgressCallback(
            onStatus,
            'loading-model-multilingual',
            `${formatLanguage(detectedLanguage)} detected — downloading enhanced model…`,
          ),
        },
      )
    }
    asr = asrSmall
    transcribeLanguage = detectedLanguage
  }

  // ── 5. Full transcription ─────────────────────────────────────────────────
  onStatus('transcribing', 'Transcribing…')
  const result = await (asr as any)(samples, {
    task: 'transcribe',
    ...(transcribeLanguage ? { language: transcribeLanguage } : {}),
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true,
  })

  onStatus('done')
  return { ...(result as TranscriptResult), language: detectedLanguage }
}

// ── Helpers ───────────────────────────────────────────────────────────────
function formatLanguage(lang: string): string {
  return lang.charAt(0).toUpperCase() + lang.slice(1)
}

export function transcriptToMarkdown(result: TranscriptResult, filename: string): string {
  const lines = [
    `# Transcript — ${filename}`,
    '',
    result.language ? `**Language detected:** ${formatLanguage(result.language)}` : '',
    '',
    '## Full text',
    '',
    result.text.trim(),
    '',
    '---',
    '',
    '## Segments',
    '',
  ]
  for (const chunk of result.chunks ?? []) {
    const [s, e] = chunk.timestamp
    lines.push(`**${fmtTime(s)} → ${fmtTime(e)}**  `)
    lines.push(chunk.text.trim())
    lines.push('')
  }
  return lines.join('\n')
}

function fmtTime(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`
  return `${pad(m)}:${pad(sec)}`
}

function pad(n: number) { return String(n).padStart(2, '0') }

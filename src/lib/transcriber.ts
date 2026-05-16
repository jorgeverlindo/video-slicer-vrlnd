import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false

export type TranscriptChunk = { timestamp: [number, number]; text: string }
export type TranscriptResult = { text: string; chunks: TranscriptChunk[] }
export type TranscriptStatus =
  | 'idle'
  | 'loading-model'
  | 'model-cached'
  | 'decoding-audio'
  | 'transcribing'
  | 'done'
  | 'error'

// Callback also carries download progress (0–100) when downloading
export type OnStatusFn = (status: TranscriptStatus, msg?: string, progress?: number | null) => void

let asr: Awaited<ReturnType<typeof pipeline>> | null = null

export async function transcribeFile(
  file: File,
  onStatus: OnStatusFn,
  ffmpegInstance?: import('@ffmpeg/ffmpeg').FFmpeg | null,
  ffmpegInputName?: string | null
): Promise<TranscriptResult> {
  // Model already in memory — no download needed
  if (asr) {
    onStatus('model-cached', 'Model cached')
  } else {
    onStatus('loading-model', 'Downloading transcription model…', null)

    // Track aggregate download progress across all model files
    const fileSizes = new Map<string, number>()
    const fileLoaded = new Map<string, number>()

    asr = await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-tiny',   // fp32 format — works with all ONNX Runtime versions
      {
        dtype: 'fp32',
        progress_callback: (p: any) => {
          if (p.status === 'progress' && p.file) {
            if (p.total)  fileSizes.set(p.file, p.total)
            if (p.loaded) fileLoaded.set(p.file, p.loaded)
            const total  = [...fileSizes.values()].reduce((a, b) => a + b, 0)
            const loaded = [...fileLoaded.values()].reduce((a, b) => a + b, 0)
            const pct = total > 0 ? Math.round((loaded / total) * 100) : null
            onStatus('loading-model', 'Downloading model…', pct)
          }
        },
      }
    )
  }

  // Decode audio → Float32Array at 16 kHz
  onStatus('decoding-audio', 'Decoding audio…')
  let samples: Float32Array

  try {
    // Primary: Web Audio API (works for native browser formats)
    const arrayBuffer = await file.arrayBuffer()
    const ctx = new AudioContext({ sampleRate: 16_000 })
    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      samples = audioBuffer.getChannelData(0)
    } finally {
      ctx.close()
    }
  } catch {
    // Fallback: FFmpeg extracts audio as WAV (for MKV, MOV, etc.)
    if (!ffmpegInstance || !ffmpegInputName) {
      throw new Error('Cannot decode audio from this video format. Try an MP4 or WebM file.')
    }
    onStatus('decoding-audio', 'Extracting audio with FFmpeg…')
    await ffmpegInstance.exec(['-i', ffmpegInputName, '-vn', '-ar', '16000', '-ac', '1', '-f', 'wav', 'audio_out.wav'])
    const data = await ffmpegInstance.readFile('audio_out.wav')
    try { await ffmpegInstance.deleteFile('audio_out.wav') } catch { /* ignore */ }
    const wavBuffer = data instanceof Uint8Array ? data.buffer : data as ArrayBuffer
    const ctx = new AudioContext({ sampleRate: 16_000 })
    try {
      const audioBuffer = await ctx.decodeAudioData(wavBuffer)
      samples = audioBuffer.getChannelData(0)
    } finally {
      ctx.close()
    }
  }

  onStatus('transcribing', 'Transcribing… (this may take a moment)')
  const result = await (asr as any)(samples, {
    task: 'transcribe',
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true,
  })

  onStatus('done')
  return result as TranscriptResult
}

export function transcriptToMarkdown(result: TranscriptResult, filename: string): string {
  const lines = [
    `# Transcript — ${filename}`,
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

// Shared types and pure utilities for transcript — no heavy ML imports here.
// Keep this file lightweight so components can import it without pulling in
// @huggingface/transformers into the main bundle.

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

// ── Markdown export ───────────────────────────────────────────────────────

export function transcriptToMarkdown(result: TranscriptResult, filename: string): string {
  const langLine = result.language
    ? `**Language:** ${result.language.charAt(0).toUpperCase() + result.language.slice(1)}\n\n`
    : ''
  const lines = [`# Transcript — ${filename}`, '', langLine]
  for (const chunk of result.chunks ?? []) {
    const [s, e] = chunk.timestamp
    lines.push(`**${fmtTime(s)} → ${fmtTime(e)}**  `)
    lines.push(chunk.text.trim())
    lines.push('')
  }
  if ((result.chunks ?? []).length === 0) lines.push(result.text.trim())
  return lines.join('\n')
}

function fmtTime(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

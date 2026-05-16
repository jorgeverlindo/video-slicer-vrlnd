import { useState } from 'react'
import { Copy, Check, Download, Loader2, Mic, ArrowDownToLine } from 'lucide-react'
import type { TranscriptResult, TranscriptStatus } from '../lib/transcriber'
import { transcriptToMarkdown } from '../lib/transcriber'
import { triggerDownload } from '../lib/zip'

type Props = {
  status: TranscriptStatus
  statusMsg: string
  result: TranscriptResult | null
  filename: string
  downloadProgress?: number | null
}

const LANGUAGE_FLAGS: Record<string, string> = {
  portuguese: '🇧🇷', english: '🇬🇧', spanish: '🇪🇸', french: '🇫🇷',
  german: '🇩🇪', italian: '🇮🇹', japanese: '🇯🇵', chinese: '🇨🇳',
  korean: '🇰🇷', russian: '🇷🇺', arabic: '🇸🇦', dutch: '🇳🇱',
}

function formatLanguage(lang: string) {
  return lang.charAt(0).toUpperCase() + lang.slice(1)
}

export default function TranscriptPanel({ status, statusMsg, result, filename, downloadProgress }: Props) {
  const [copied, setCopied] = useState(false)

  if (status === 'idle') return null

  const md = result ? transcriptToMarkdown(result, filename) : null
  const isLoading = status !== 'done' && status !== 'error'
  const isDownloading = status === 'loading-model' || status === 'loading-model-multilingual'

  function copyText() {
    if (!result) return
    navigator.clipboard.writeText(result.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function downloadMd() {
    if (!md) return
    const blob = new Blob([md], { type: 'text/markdown' })
    const stem = filename.replace(/\.[^.]+$/, '')
    triggerDownload(blob, `transcript_${stem}.md`)
  }

  return (
    <section style={{ marginTop: 32 }}>

      {/* ── Header ── */}
      <div style={{
        borderBottom: '1px solid var(--border)',
        paddingBottom: 16, marginBottom: 20,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Mic size={15} style={{ color: 'var(--brand)', opacity: 0.8 }} />
          <h2 style={{ lineHeight: 1 }}>Transcription</h2>

          {/* Language badge — shown when done */}
          {status === 'done' && result?.language && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 11, fontWeight: 500,
              background: 'var(--brand-tint)', color: 'var(--brand)',
              borderRadius: 99, padding: '2px 9px', border: '1px solid var(--brand-18)',
            }}>
              {LANGUAGE_FLAGS[result.language] ?? '🌐'} {formatLanguage(result.language)}
            </span>
          )}

          {/* Model cached badge */}
          {status === 'model-cached' && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 500,
              background: 'var(--success-bg, #ecfdf5)', color: 'var(--success-fg, #166534)',
              borderRadius: 99, padding: '2px 8px',
            }}>
              <Check size={10} /> Model cached
            </span>
          )}

          {/* Spinner for non-download phases */}
          {isLoading && !isDownloading && status !== 'model-cached' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
              {statusMsg}
            </span>
          )}
        </div>

        {result && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={copyText}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'Copied!' : 'Copy text'}
            </button>
            <button className="btn btn-secondary" onClick={downloadMd}>
              <Download size={15} /> Download .md
            </button>
          </div>
        )}
      </div>

      {/* ── Download progress (tiny or multilingual) ── */}
      {isDownloading && (
        <div style={{
          background: 'var(--gray-100)', borderRadius: 'var(--radius-lg)', padding: '20px 24px',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 12, fontSize: 13, color: 'var(--text-primary)', fontWeight: 500,
          }}>
            <ArrowDownToLine size={14} style={{ color: 'var(--brand)' }} />
            <span style={{ flex: 1 }}>{statusMsg || 'Downloading model…'}</span>
            {downloadProgress != null && (
              <span style={{
                fontVariantNumeric: 'tabular-nums',
                fontFamily: 'JetBrains Mono, SF Mono, monospace',
                fontSize: 12, color: 'var(--text-secondary)',
              }}>
                {downloadProgress}%
              </span>
            )}
          </div>

          <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{
              height: '100%', background: 'var(--brand)', borderRadius: 99,
              width: downloadProgress != null ? `${downloadProgress}%` : '0%',
              transition: 'width 0.3s ease',
            }} />
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {status === 'loading-model-multilingual'
              ? 'Enhanced multilingual model (~460 MB) — cached after first download'
              : 'First time only — model is cached in your browser after this'}
          </div>
        </div>
      )}

      {/* ── Detecting / decoding / transcribing spinner ── */}
      {isLoading && !isDownloading && status !== 'model-cached' && (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 8px' }} />
          {statusMsg}
        </div>
      )}

      {/* ── Error ── */}
      {status === 'error' && (
        <div style={{
          padding: '16px', fontSize: 13,
          color: 'var(--text-secondary)', background: 'var(--gray-100)',
          borderRadius: 'var(--radius-md)',
        }}>
          {statusMsg}
        </div>
      )}

      {/* ── Result ── */}
      {result && (
        <div style={{
          background: 'var(--gray-100)', borderRadius: 'var(--radius-lg)',
          padding: '20px 24px', fontSize: 14, lineHeight: 1.7,
          color: 'var(--text-primary)', maxHeight: 360, overflowY: 'auto', fontFamily: 'inherit',
        }}>
          {(result.chunks ?? []).length > 0
            ? result.chunks.map((chunk, i) => (
                <span key={i} title={`${fmtTime(chunk.timestamp[0])} → ${fmtTime(chunk.timestamp[1])}`}>
                  {chunk.text}
                </span>
              ))
            : result.text
          }
        </div>
      )}
    </section>
  )
}

function fmtTime(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

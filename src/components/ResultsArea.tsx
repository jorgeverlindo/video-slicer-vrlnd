import { useState, useEffect, useRef } from 'react'
import { Download, X, Copy, Check, Loader2, Mic, FileImage, ArrowDownToLine } from 'lucide-react'
import type { Frame } from '../lib/extractor'
import { fmtTimecode } from '../lib/extractor'
import type { TranscriptResult, TranscriptStatus } from '../lib/transcriber'
import { transcriptToMarkdown } from '../lib/transcriber'
import { frameFilename, packAsZip, triggerDownload } from '../lib/zip'

type Tab = 'frames' | 'transcript'

type Props = {
  frames: Frame[]
  onClear: () => void
  transcriptStatus: TranscriptStatus
  transcriptMsg: string
  transcriptResult: TranscriptResult | null
  transcriptProgress: number | null
  filename: string
}

export default function ResultsArea({
  frames, onClear,
  transcriptStatus, transcriptMsg, transcriptResult, transcriptProgress,
  filename,
}: Props) {
  const [activeTab, setActiveTab]         = useState<Tab>('transcript')
  const [packing, setPacking]             = useState(false)
  const [includeTranscript, setInclude]   = useState(false)
  const [copied, setCopied]               = useState(false)
  const prevLen                           = useRef(0)

  // Auto-switch to Frames when the first frame arrives
  useEffect(() => {
    if (prevLen.current === 0 && frames.length > 0) setActiveTab('frames')
    if (frames.length === 0 && transcriptStatus !== 'idle') setActiveTab('transcript')
    prevLen.current = frames.length
  }, [frames.length, transcriptStatus])

  const hasFrames     = frames.length > 0
  const hasTranscript = transcriptStatus !== 'idle'
  if (!hasFrames && !hasTranscript) return null

  const totalMb      = (frames.reduce((s, f) => s + f.blob.size, 0) / 1024 / 1024).toFixed(1)
  const transcriptMd = transcriptResult ? transcriptToMarkdown(transcriptResult, filename) : null
  const txReady      = transcriptStatus === 'done' && !!transcriptMd
  const txLoading    = transcriptStatus !== 'done' && transcriptStatus !== 'error' && transcriptStatus !== 'idle'

  async function downloadAll() {
    if (packing) return
    setPacking(true)
    const zip = await packAsZip(frames, includeTranscript && transcriptMd ? transcriptMd : undefined)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    triggerDownload(zip, `frames_${stamp}.zip`)
    setPacking(false)
  }

  async function copyTranscript() {
    if (!transcriptResult) return
    const text = transcriptResult.text
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Clipboard API blocked — textarea fallback
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function downloadMd() {
    if (!transcriptMd) return
    const stem = filename.replace(/\.[^.]+$/, '')
    triggerDownload(new Blob([transcriptMd], { type: 'text/markdown' }), `transcript_${stem}.md`)
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <section style={{ marginTop: 32 }}>

      {/* ── Sticky tab bar ───────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'var(--app-bg)',
        paddingTop: 12,
        marginBottom: 20,
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0 }}>
            {hasFrames && (
              <TabBtn
                active={activeTab === 'frames'}
                onClick={() => setActiveTab('frames')}
              >
                <FileImage size={13} />
                Frames
                <span className="results-count-chip">{frames.length}</span>
              </TabBtn>
            )}

            {hasTranscript && (
              <TabBtn
                active={activeTab === 'transcript'}
                onClick={() => setActiveTab('transcript')}
              >
                <Mic size={13} />
                Transcription
                {txLoading && (
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'var(--brand)', flexShrink: 0,
                    animation: 'pulse 1.5s ease-in-out infinite',
                  }} />
                )}
                {transcriptStatus === 'done' && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', flexShrink: 0 }} />
                )}
              </TabBtn>
            )}
          </div>

          {/* Context actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10 }}>
            {activeTab === 'frames' && hasFrames && (
              <>
                {txReady && (
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 12, color: 'var(--text-secondary)',
                    cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                  }}>
                    <input
                      type="checkbox"
                      checked={includeTranscript}
                      onChange={e => setInclude(e.target.checked)}
                      style={{ accentColor: 'var(--brand)', width: 13, height: 13 }}
                    />
                    Include transcript in ZIP
                  </label>
                )}
                <button className="btn btn-secondary" onClick={onClear}><X size={16} /> Clear</button>
                <button className="btn btn-primary" onClick={downloadAll} disabled={packing}>
                  <Download size={16} /> {packing ? 'Packing…' : 'Download all (ZIP)'}
                </button>
              </>
            )}

            {activeTab === 'transcript' && transcriptResult && (
              <>
                <button className="btn btn-secondary" onClick={copyTranscript}>
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? 'Copied!' : 'Copy text'}
                </button>
                <button className="btn btn-secondary" onClick={downloadMd}>
                  <Download size={15} /> Download .md
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Frames tab ───────────────────────────────────────────────────── */}
      {activeTab === 'frames' && (
        hasFrames ? (
          <>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
              {frames.length} frames · {totalMb} MB total · click a frame to download individually
            </p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 16,
            }}>
              {frames.map((frame) => (
                <div
                  key={frame.index}
                  className="frame-card"
                  onClick={() => triggerDownload(frame.blob, frameFilename(frame))}
                >
                  <div className="frame-img-wrap">
                    <img src={frame.url} alt={`Frame ${frame.index}`} loading="lazy" />
                  </div>
                  <button
                    className="frame-dl-btn"
                    onClick={e => { e.stopPropagation(); triggerDownload(frame.blob, frameFilename(frame)) }}
                  >
                    <Download size={14} /> Download
                  </button>
                  <div className="frame-meta">
                    <span className="frame-num-chip">#{String(frame.index).padStart(3, '0')}</span>
                    <span className="frame-time">{fmtTimecode(frame.timestamp)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <Empty>Extract frames to see them here</Empty>
        )
      )}

      {/* ── Transcript tab ───────────────────────────────────────────────── */}
      {activeTab === 'transcript' && (
        <>
          {/* Downloading model */}
          {transcriptStatus === 'loading-model' && (
            <div style={{ background: 'var(--gray-100)', borderRadius: 'var(--radius-lg)', padding: '20px 24px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginBottom: 12, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)',
              }}>
                <ArrowDownToLine size={14} style={{ color: 'var(--brand)' }} />
                Downloading transcription model
                {transcriptProgress != null && (
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: 12, color: 'var(--text-secondary)',
                    fontFamily: 'JetBrains Mono, SF Mono, monospace',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {transcriptProgress}%
                  </span>
                )}
              </div>
              {/* Progress bar */}
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{
                  height: '100%', background: 'var(--brand)', borderRadius: 99,
                  width: `${transcriptProgress ?? 0}%`,
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
                First time only — cached in your browser after this and loads instantly
              </p>
            </div>
          )}

          {/* Decoding / transcribing */}
          {(transcriptStatus === 'model-cached' || transcriptStatus === 'decoding-audio' || transcriptStatus === 'transcribing') && (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 10px' }} />
              {transcriptMsg}
            </div>
          )}

          {/* Error */}
          {transcriptStatus === 'error' && (
            <div style={{ padding: 16, fontSize: 13, color: 'var(--text-secondary)', background: 'var(--gray-100)', borderRadius: 'var(--radius-md)' }}>
              {transcriptMsg}
            </div>
          )}

          {/* Result */}
          {transcriptResult && (
            <div style={{
              background: 'var(--gray-100)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px 24px',
              fontSize: 14, lineHeight: 1.8,
              color: 'var(--text-primary)',
              maxHeight: 520,
              overflowY: 'auto',
            }}>
              {(transcriptResult.chunks ?? []).length > 0
                ? transcriptResult.chunks.map((chunk, i) => (
                    <span key={i} title={`${fmtT(chunk.timestamp[0])} → ${fmtT(chunk.timestamp[1])}`}>
                      {chunk.text}
                    </span>
                  ))
                : transcriptResult.text}
            </div>
          )}
        </>
      )}
    </section>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 16px 10px',
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 13, fontWeight: active ? 600 : 400,
        color: active ? 'var(--brand)' : 'var(--text-secondary)',
        borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
        marginBottom: -1,
        transition: 'color 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
      {children}
    </div>
  )
}

function fmtT(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

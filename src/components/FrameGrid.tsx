import { useState } from 'react'
import { Download, X } from 'lucide-react'
import type { Frame } from '../lib/extractor'
import { fmtTimecode } from '../lib/extractor'
import { frameFilename, packAsZip, triggerDownload } from '../lib/zip'

type Props = {
  frames: Frame[]
  onClear: () => void
  transcriptMd?: string | null
}

export default function FrameGrid({ frames, onClear, transcriptMd }: Props) {
  const [packing, setPacking] = useState(false)
  const [includeTranscript, setIncludeTranscript] = useState(false)

  if (frames.length === 0) return null

  const totalMb = (frames.reduce((s, f) => s + f.blob.size, 0) / 1024 / 1024).toFixed(1)

  async function downloadAll() {
    if (packing) return
    setPacking(true)
    const zip = await packAsZip(frames, includeTranscript && transcriptMd ? transcriptMd : undefined)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    triggerDownload(zip, `frames_${stamp}.zip`)
    setPacking(false)
  }

  function downloadOne(frame: Frame) {
    triggerDownload(frame.blob, frameFilename(frame))
  }

  return (
    <section style={{ marginTop: 32 }}>
      {/* Sticky header — sticks below the 56px navbar */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        background: 'var(--app-bg)',
        paddingTop: 16,
        paddingBottom: 16,
        marginBottom: 20,
        borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ lineHeight: 1 }}>Extracted frames</h2>
            <span className="results-count-chip">{frames.length}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
            {frames.length} frames · {totalMb} MB total · click a frame to download individually
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {transcriptMd && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={includeTranscript}
                onChange={e => setIncludeTranscript(e.target.checked)}
                style={{ accentColor: 'var(--brand)', width: 13, height: 13 }}
              />
              Include transcript in ZIP
            </label>
          )}
          <button className="btn btn-secondary" onClick={onClear}>
            <X size={16} /> Clear
          </button>
          <button className="btn btn-primary" onClick={downloadAll} disabled={packing}>
            <Download size={16} /> {packing ? 'Packing…' : 'Download all (ZIP)'}
          </button>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 16,
      }}>
        {frames.map((frame) => (
          <div key={frame.index} className="frame-card" onClick={() => downloadOne(frame)}>
            <div className="frame-img-wrap">
              <img src={frame.url} alt={`Frame ${frame.index}`} loading="lazy" />
            </div>
            <button className="frame-dl-btn" onClick={(e) => { e.stopPropagation(); downloadOne(frame) }}>
              <Download size={14} /> Download
            </button>
            <div className="frame-meta">
              <span className="frame-num-chip">#{String(frame.index).padStart(3, '0')}</span>
              <span className="frame-time">{fmtTimecode(frame.timestamp)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

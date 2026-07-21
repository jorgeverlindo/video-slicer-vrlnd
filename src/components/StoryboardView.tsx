import { useEffect, useMemo, useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import type { Frame, AspectRatio } from '../lib/extractor'
import { ASPECT_RATIO_H, fmtTimecode } from '../lib/extractor'
import type { TranscriptChunk } from '../lib/transcript-types'

type Props = {
  frames: Frame[]
  chunks: (TranscriptChunk | undefined)[]
  filename: string
  aspectRatio?: AspectRatio
}

// ── PDF export ────────────────────────────────────────────────────────────────

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(new Error('Failed to read frame image'))
    r.readAsDataURL(blob)
  })
}

async function exportPdf(
  orderedFrames: Frame[],
  orderedChunks: (TranscriptChunk | undefined)[],
  notes: string[],
  editedChunks: string[],
  footerNote: string,
  filename: string,
  aspectRatio: AspectRatio = '16:9',
) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })

  const NCOLS = 3
  const PW = 279.4, PH = 215.9
  const M = 12, HDR = 15, FTR = 13, GX = 7, GY = 6
  const footnote = footerNote.trim()
  const cW = (PW - 2 * M - (NCOLS - 1) * GX) / NCOLS

  const BADGE_R = 2.3, BADGE_BOT = BADGE_R * 2 + 1.5
  const IMG_H = cW * ASPECT_RATIO_H[aspectRatio]
  const IMG_TO_TX = 2, TX_LH = 3.8, TX_LINES = 4, DESC_H = 8.5

  // Dynamic rows-per-page: portrait ratios get fewer rows and more pages
  const availH = PH - M - HDR - (footnote ? FTR : 0) - M
  const cellMinH = BADGE_BOT + IMG_H + IMG_TO_TX + 2 * TX_LH
  const NROWS = Math.max(1, Math.floor((availH + GY) / (cellMinH + GY)))
  const FPP = NCOLS * NROWS
  const cellAvailH = (availH - (NROWS - 1) * GY) / NROWS
  const cellTextBudget = cellAvailH - BADGE_BOT - IMG_H - IMG_TO_TX
  const txLinesActual = Math.max(1, Math.min(TX_LINES, Math.floor(cellTextBudget / TX_LH)))
  const descFits = cellTextBudget >= txLinesActual * TX_LH + DESC_H + 2
  const CELL_H = BADGE_BOT + IMG_H + IMG_TO_TX + txLinesActual * TX_LH + (descFits ? DESC_H : 0)

  const stem = filename.replace(/\.[^.]+$/, '')
  const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  const images = await Promise.all(orderedFrames.map((f) => blobToDataURL(f.blob)))

  const nPages = Math.max(1, Math.ceil(orderedFrames.length / FPP))

  for (let page = 0; page < nPages; page++) {
    if (page > 0) doc.addPage()

    // Header — title left, date + page right, divider
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(30, 30, 30)
    doc.text(`Storyboard — ${stem}`, M, M + 5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(130, 130, 130)
    doc.text(`${dateStr}  ·  ${page + 1}/${nPages}`, PW - M, M + 5, { align: 'right' })
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.3)
    doc.line(M, M + HDR - 4, PW - M, M + HDR - 4)

    for (let i = 0; i < FPP; i++) {
      const idx = page * FPP + i
      if (idx >= orderedFrames.length) break
      const frame = orderedFrames[idx]
      const col = i % NCOLS
      const row = Math.floor(i / NCOLS)
      const x = M + col * (cW + GX)
      const y = M + HDR + 1 + row * (CELL_H + GY)

      // Badge — numbered circle + timecode
      doc.setFillColor(30, 30, 30)
      doc.circle(x + BADGE_R, y + BADGE_R, BADGE_R, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(255, 255, 255)
      doc.text(String(idx + 1), x + BADGE_R, y + BADGE_R + 0.9, { align: 'center' })
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(150, 150, 150)
      doc.text(fmtTimecode(frame.timestamp).slice(0, 8), x + BADGE_R * 2 + 2, y + BADGE_R + 0.9)

      // Image
      const imgY = y + BADGE_BOT
      doc.addImage(images[idx], 'JPEG', x, imgY, cW, IMG_H)

      // Transcript text
      const text = (editedChunks[idx] ?? orderedChunks[idx]?.text ?? '').trim()
      let txBottom = imgY + IMG_H + IMG_TO_TX
      if (text) {
        doc.setFontSize(8)
        doc.setTextColor(60, 60, 60)
        const lines = (doc.splitTextToSize(text, cW) as string[]).slice(0, txLinesActual)
        doc.text(lines, x, txBottom + 2.8)
        txBottom += lines.length * TX_LH
      }

      // Description note
      const note = (notes[idx] ?? '').trim()
      if (note && descFits) {
        doc.setFontSize(7)
        doc.setTextColor(150, 150, 150)
        const noteLines = (doc.splitTextToSize(note, cW) as string[]).slice(0, 2)
        doc.text(noteLines, x, txBottom + 3)
      }
    }

    // Footer — only when the user typed a footnote
    if (footnote) {
      const ftRuleY = PH - M - FTR
      doc.setDrawColor(220, 220, 220)
      doc.setLineWidth(0.3)
      doc.line(M, ftRuleY, PW - M, ftRuleY)
      doc.setFontSize(7.5)
      doc.setTextColor(130, 130, 130)
      const ftLines = (doc.splitTextToSize(footnote, PW - 2 * M) as string[]).slice(0, 2)
      doc.text(ftLines, M, ftRuleY + 4.5)
    }
  }

  doc.save(`storyboard_${stem}.pdf`)
}

// ── Card ──────────────────────────────────────────────────────────────────────

type CardProps = {
  frame: Frame
  index: number
  chunk: TranscriptChunk | undefined
  editedText: string
  onTextChange: (v: string) => void
  note: string
  onNoteChange: (v: string) => void
}

function ThumbnailCard({ frame, index, chunk, editedText, onTextChange, note, onNoteChange }: CardProps) {
  // Transcript field collapses when there is no chunk and nothing typed
  const showTranscript = chunk !== undefined || editedText.trim() !== ''
  return (
    <div className="vsthumb">
      <div className="vsthumb-head">
        <span className="vsthumb-badge">{index + 1}</span>
        <span className="vsthumb-time">{fmtTimecode(frame.timestamp).slice(0, 8)}</span>
      </div>
      <img className="vsthumb-img" src={frame.url} alt={`Storyboard frame ${index + 1}`} loading="lazy" />
      {showTranscript && (
        <textarea
          className="vsthumb-tx"
          value={editedText}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Transcript…"
          rows={3}
        />
      )}
      <input
        className="vsthumb-desc"
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        placeholder="Add a note…"
      />
    </div>
  )
}

// ── View ──────────────────────────────────────────────────────────────────────

export default function StoryboardView({ frames, chunks, filename, aspectRatio = '16:9' }: Props) {
  const initialTexts = useMemo(() => frames.map((_, i) => chunks[i]?.text.trim() ?? ''), [frames, chunks])
  const [editedChunks, setEditedChunks] = useState<string[]>(initialTexts)
  const [notes, setNotes] = useState<string[]>(() => frames.map(() => ''))
  const [footerNote, setFooterNote] = useState('')
  const [exporting, setExporting] = useState(false)

  // Re-seed edits when frames are regenerated
  useEffect(() => {
    setEditedChunks(initialTexts)
    setNotes(frames.map(() => ''))
  }, [initialTexts, frames])

  const stem = filename.replace(/\.[^.]+$/, '')

  async function handleExport() {
    if (exporting) return
    setExporting(true)
    try {
      await exportPdf(frames, chunks, notes, editedChunks, footerNote, filename, aspectRatio)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      {/* Toolbar — footnote field + export */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <input
          className="sb-footnote-input"
          value={footerNote}
          onChange={(e) => setFooterNote(e.target.value)}
          placeholder="Fill in your footnote here"
        />
        <button className="btn btn-primary" onClick={handleExport} disabled={exporting} style={{ flexShrink: 0 }}>
          {exporting
            ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
            : <FileDown size={15} />}
          {exporting ? 'Exporting…' : 'Export PDF'}
        </button>
      </div>

      {/* Document preview */}
      <div className="sb-doc" style={{ '--sb-img-ratio': aspectRatio.replace(':', '/') } as React.CSSProperties}>
        <div className="sb-doc-header">
          <span className="sb-doc-title">Storyboard — {stem}</span>
          <span className="sb-doc-meta">
            {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
          </span>
        </div>

        <div className="sb-grid">
          {frames.map((frame, i) => (
            <ThumbnailCard
              key={frame.index}
              frame={frame}
              index={i}
              chunk={chunks[i]}
              editedText={editedChunks[i] ?? ''}
              onTextChange={(v) => setEditedChunks((prev) => prev.map((t, j) => (j === i ? v : t)))}
              note={notes[i] ?? ''}
              onNoteChange={(v) => setNotes((prev) => prev.map((t, j) => (j === i ? v : t)))}
            />
          ))}
        </div>

        {footerNote.trim() && (
          <div className="sb-doc-footer">
            <p className="sb-footnote-text">{footerNote.trim()}</p>
          </div>
        )}
      </div>
    </div>
  )
}

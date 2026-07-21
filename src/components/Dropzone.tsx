import { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Link, Loader2, AlertCircle } from 'lucide-react'

type Props = { onFile: (file: File) => void }

export default function Dropzone({ onFile }: Props) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'video/*': ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v'] },
    multiple: false,
    onDropAccepted: ([file]) => onFile(file),
  })

  return (
    <div>
      {/* ── Drop / click zone ─────────────────────────────────────── */}
      <div {...getRootProps()} className={`dropzone${isDragActive ? ' dragover' : ''}`}>
        <input {...getInputProps()} />
        <div className="dropzone-icon"><Upload size={28} /></div>
        <div className="dropzone-title">
          {isDragActive ? 'Drop the video here' : 'Drop a video here or click to browse'}
        </div>
        <div className="dropzone-hint">
          MP4<span className="sep">·</span>MOV<span className="sep">·</span>WEBM
          <span className="sep">·</span>MKV<span className="sep">·</span>up to a few minutes
        </div>
      </div>

      {/* ── URL input ─────────────────────────────────────────────── */}
      <UrlInput onFile={onFile} />
    </div>
  )
}

// ── URL fetch component ───────────────────────────────────────────────────────

function UrlInput({ onFile }: { onFile: (file: File) => void }) {
  const [url, setUrl]           = useState('')
  const [loading, setLoading]   = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError]       = useState<string | null>(null)

  async function handleLoad(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed || loading) return

    setLoading(true)
    setError(null)
    setProgress(null)

    try {
      const resp = await fetch(trimmed, { mode: 'cors' })

      if (!resp.ok) {
        if (resp.status === 403 || resp.status === 401) {
          throw new Error(`Access denied (${resp.status}) — the URL may have expired or require authentication.`)
        }
        throw new Error(`Server returned ${resp.status}.`)
      }

      const contentType = resp.headers.get('content-type') ?? ''
      const isVideo = contentType.startsWith('video/') || contentType.includes('octet-stream')
      const looksLikeVideo = /\.(mp4|mov|webm|mkv|m4v|avi)/i.test(trimmed.split('?')[0])
      if (!isVideo && !looksLikeVideo) {
        throw new Error('URL does not appear to point to a video file.')
      }

      // Stream with progress
      const contentLength = resp.headers.get('content-length')
      const total = contentLength ? parseInt(contentLength, 10) : null
      const reader = resp.body!.getReader()
      const parts: Uint8Array[] = []
      let loaded = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        parts.push(value)
        loaded += value.byteLength
        if (total) setProgress(Math.round((loaded / total) * 100))
      }

      // Build File from blob
      const mimeType  = contentType.split(';')[0].trim() || 'video/mp4'
      const blob      = new Blob(parts, { type: mimeType })

      // Extract a clean filename
      let filename = 'video.mp4'
      const disp   = resp.headers.get('content-disposition') ?? ''
      const dispMatch = disp.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)/i)
      if (dispMatch) {
        filename = decodeURIComponent(dispMatch[1].trim())
      } else {
        const pathname = new URL(trimmed).pathname
        const last     = pathname.split('/').pop()
        if (last && /\.[a-z0-9]{2,4}$/i.test(last)) filename = last
      }

      onFile(new File([blob], filename, { type: mimeType }))
      setUrl('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (
        msg.toLowerCase().includes('failed to fetch') ||
        msg.toLowerCase().includes('networkerror') ||
        msg.toLowerCase().includes('cors')
      ) {
        setError("This URL doesn't allow direct browser access. Download the file and upload it instead.")
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  const progressLabel = progress !== null ? `${progress}%` : 'Downloading…'

  return (
    <div className="url-input-wrap">
      <div className="url-input-divider">
        <span>or paste a video URL</span>
      </div>

      <form onSubmit={handleLoad} className="url-input-form">
        <div className="url-input-field-wrap">
          <Link size={14} className="url-input-icon" />
          <input
            type="url"
            className="url-input-field"
            placeholder="https://example.com/video.mp4"
            value={url}
            onChange={e => { setUrl(e.target.value); setError(null) }}
            disabled={loading}
            spellCheck={false}
          />
        </div>
        <button
          type="submit"
          className="btn btn-secondary"
          disabled={loading || !url.trim()}
          style={{ flexShrink: 0 }}
        >
          {loading
            ? <><Loader2 size={14} style={{ animation: 'spin 0.75s linear infinite' }} />{progressLabel}</>
            : 'Load URL'
          }
        </button>
      </form>

      {error && (
        <div className="url-input-error">
          <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </div>
      )}
    </div>
  )
}

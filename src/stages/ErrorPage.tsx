import { useState } from 'react'
import { Video, Copy, Checkmark } from '@carbon/icons-react'

const FFMPEG = 'ffmpeg -i input.mkv -c:v libx264 -c:a aac output.mp4'

// E1 — the native player and the universal converter both failed.
export default function ErrorPage({ fileName, error, onRetry }: { fileName: string; error: string; onRetry: () => void }) {
  const [copied, setCopied] = useState(false)
  const command = FFMPEG.replace('input.mkv', fileName.includes(' ') ? `"${fileName}"` : fileName || 'input.mkv')

  async function copy() {
    try { await navigator.clipboard.writeText(command) } catch { /* clipboard blocked */ }
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="errpage" role="alert">
      <span className="errpage__icon"><Video size={24} /></span>
      <div className="errpage__head">
        <h1 className="t-title-m">We can't process this video</h1>
        <p className="t-body-l c-subtle">
          Your browser and our converter both failed to read {fileName || 'this file'}. Converting it to MP4 usually fixes this.
        </p>
      </div>
      <div className="errpage__raw">
        <span className="t-label-s c-subtle">Error details</span>
        <code className="t-mono-s c-subtle">{error}</code>
      </div>

      <h2 className="t-label-l">Convert it first</h2>
      <div className="errpage__options">
        <section className="errpage__card">
          <h3 className="t-label-l">On a Mac, with QuickTime</h3>
          <ol className="errpage__steps t-body-m">
            <li>Open the video in QuickTime Player.</li>
            <li>Choose File, then Export As, then 1080p.</li>
            <li>Upload the new file here.</li>
          </ol>
        </section>
        <section className="errpage__card">
          <h3 className="t-label-l">Anywhere, with ffmpeg</h3>
          <p className="t-body-m c-subtle">Run this in a terminal, then upload output.mp4.</p>
          <pre className="errpage__code t-mono-s">{command}</pre>
          <div>
            <button type="button" className="btn btn--secondary" onClick={copy}>
              {copied ? <Checkmark size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy command'}
            </button>
          </div>
        </section>
      </div>

      <div><button type="button" className="btn btn--primary btn--l" onClick={onRetry}>Try another file</button></div>
    </div>
  )
}

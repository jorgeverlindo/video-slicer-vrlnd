import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { PlayCircle, X } from 'lucide-react'
import type { Chapter } from '../demo/how-it-works/HowItWorksDemo'

// The demo (and the Stageshow kit behind it) loads only when the dialog opens,
// so the main bundle stays as it was.
const HowItWorksDemo = lazy(() => import('../demo/how-it-works/HowItWorksDemo'))

const CHAPTERS: { n: Chapter; title: string; caption: string }[] = [
  { n: 1, title: 'Upload & extract', caption: 'Drop a recording, keep only unique frames, turn on the transcript and pick its language.' },
  { n: 2, title: 'Read & export', caption: 'Read the transcript with timecodes, then download the frames and transcript as one ZIP.' },
]

type Props = { theme: 'light' | 'dark' }

export default function HowItWorks({ theme }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [chapter, setChapter] = useState<Chapter>(1)
  // A chapter click remounts the demo at that chapter's start
  const [run, setRun] = useState({ key: 0, startAt: 1 as Chapter })

  const jump = useCallback((n: Chapter) => {
    setChapter(n)
    setRun((r) => ({ key: r.key + 1, startAt: n }))
  }, [])

  const show = useCallback(() => {
    setChapter(1)
    setRun((r) => ({ key: r.key + 1, startAt: 1 }))
    setOpen(true)
    dialog.current?.showModal()
  }, [])

  const close = useCallback(() => dialog.current?.close(), [])

  // Esc and the close button both end in the dialog's close event
  useEffect(() => {
    const d = dialog.current
    if (!d) return
    const onClose = () => setOpen(false)
    d.addEventListener('close', onClose)
    return () => d.removeEventListener('close', onClose)
  }, [])

  const current = CHAPTERS[chapter - 1]

  return (
    <>
      <button type="button" className="btn btn-secondary hiw-trigger" onClick={show}>
        <PlayCircle size={16} strokeWidth={1.5} />
        How it works
      </button>

      <dialog
        ref={dialog}
        className="hiw-dialog"
        aria-labelledby="hiw-title"
        onClick={(e) => { if (e.target === e.currentTarget) close() }}
      >
        <div className="hiw-panel">
          <header className="hiw-head">
            <div>
              <p className="hiw-eyebrow">How it works</p>
              <h2 id="hiw-title" className="hiw-title">From a recording to frames and a transcript</h2>
            </div>
            <button type="button" className="hiw-close" onClick={close} aria-label="Close">
              <X size={18} strokeWidth={1.5} />
            </button>
          </header>

          <ol className="hiw-steps" aria-label="Chapters">
            {CHAPTERS.map((c) => (
              <li key={c.n}>
                <button
                  type="button"
                  className="hiw-step"
                  data-on={c.n === chapter || undefined}
                  aria-current={c.n === chapter ? 'step' : undefined}
                  onClick={() => jump(c.n)}
                >
                  <span className="hiw-step__n">{c.n}</span>
                  {c.title}
                </button>
              </li>
            ))}
          </ol>

          <div className="hiw-stage">
            {open && (
              <Suspense fallback={<div className="hiw-loading" />}>
                <HowItWorksDemo key={run.key} startAt={run.startAt} theme={theme} onChapter={setChapter} />
              </Suspense>
            )}
          </div>

          <p className="hiw-caption" aria-live="polite">{current.caption}</p>
        </div>
      </dialog>
    </>
  )
}

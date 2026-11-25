import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Close } from '@carbon/icons-react'
import type { Chapter } from '../demo/how-it-works/HowItWorksDemo'

// The demo (and the Stageshow kit behind it) loads only when the dialog opens.
const HowItWorksDemo = lazy(() => import('../demo/how-it-works/HowItWorksDemo'))

const CHAPTERS: { n: Chapter; title: string; caption: string }[] = [
  { n: 1, title: 'Upload and extract', caption: 'Drop a recording, keep only unique frames, turn on the transcript and pick its language.' },
  { n: 2, title: 'Read and export', caption: 'Read the transcript with timecodes, then download the frames and transcript as one ZIP.' },
]

type Props = {
  theme: 'light' | 'dark'
  trigger: (show: () => void) => ReactNode
}

// S1e. Modal motion (M9): backdrop fades, panel scales 0.97 → 1 on entry;
// on close it fades out faster than it came in, then the dialog closes.
export default function HowItWorks({ theme, trigger }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [chapter, setChapter] = useState<Chapter>(1)
  const [run, setRun] = useState({ key: 0, startAt: 1 as Chapter })

  const jump = useCallback((n: Chapter) => {
    setChapter(n)
    setRun((r) => ({ key: r.key + 1, startAt: n }))
  }, [])

  const show = useCallback(() => {
    setChapter(1)
    setRun((r) => ({ key: r.key + 1, startAt: 1 }))
    setOpen(true)
    setClosing(false)
    dialog.current?.showModal()
  }, [])

  const close = useCallback(() => {
    const d = dialog.current
    if (!d?.open) return
    setClosing(true)
    const done = () => { d.close(); setClosing(false) }
    const panel = d.querySelector('.hiw-panel')
    if (!panel || matchMedia('(prefers-reduced-motion: reduce)').matches) return done()
    panel.addEventListener('animationend', done, { once: true })
  }, [])

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    const onClose = () => setOpen(false)
    const onCancel = (e: Event) => { e.preventDefault(); close() } // Esc runs the exit too
    d.addEventListener('close', onClose)
    d.addEventListener('cancel', onCancel)
    return () => { d.removeEventListener('close', onClose); d.removeEventListener('cancel', onCancel) }
  }, [close])

  const current = CHAPTERS[chapter - 1]

  return (
    <>
      {trigger(show)}
      <dialog
        ref={dialog}
        className="hiw-dialog"
        data-closing={closing || undefined}
        aria-labelledby="hiw-title"
        onClick={(e) => { if (e.target === e.currentTarget) close() }}
      >
        <div className="hiw-panel">
          <header className="hiw-head">
            <h2 id="hiw-title" className="t-title-m">From a recording to frames and a transcript</h2>
            <button type="button" className="icon-btn icon-btn--outline" onClick={close} aria-label="Close">
              <Close size={16} />
            </button>
          </header>

          <ol className="hiw-steps" aria-label="Chapters">
            {CHAPTERS.map((c) => (
              <li key={c.n}>
                <button
                  type="button" className="hiw-step"
                  data-on={c.n === chapter || undefined}
                  aria-current={c.n === chapter ? 'step' : undefined}
                  onClick={() => jump(c.n)}
                >
                  <span className="hiw-step__n t-label-s">{c.n}</span>
                  <span className="t-label-m">{c.title}</span>
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

          <div className="hiw-rail" aria-hidden="true">
            {CHAPTERS.map((c) => <span key={c.n} data-on={c.n <= chapter || undefined} />)}
          </div>
          <p className="t-body-m hiw-caption" aria-live="polite">{current.caption}</p>
        </div>
      </dialog>
    </>
  )
}

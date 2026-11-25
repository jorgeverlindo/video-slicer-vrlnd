import { Asleep, Light, Checkmark, Security } from '@carbon/icons-react'
import JorgeLogo from '../brand/JorgeLogo'

export type Step = 1 | 2 | 3

type Props = {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  step: Step
  busy: boolean
  /** Steps the user can jump to without losing work */
  canGoTo: (s: Step) => boolean
  onGoTo: (s: Step) => void
}

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Video' },
  { n: 2, label: 'Slice' },
  { n: 3, label: 'Result' },
]

export default function Topbar({ theme, onToggleTheme, step, busy, canGoTo, onGoTo }: Props) {
  const dark = theme === 'dark'
  return (
    <header className="topbar enter" style={{ '--i': 0 } as React.CSSProperties}>
      <a className="brand" href="https://jorgeverlindo.design" aria-label="Video Slicer by Jorge Verlindo, opens the portfolio">
        <JorgeLogo busy={busy} />
        <span className="brand__name t-title-s">Video Slicer</span>
        <span className="brand__by t-caption">by Jorge Verlindo</span>
      </a>

      <nav className="steps" aria-label="Progress">
        <ol>
          {STEPS.map((s, i) => {
            const state = s.n < step ? 'done' : s.n === step ? 'current' : 'todo'
            const go = state !== 'current' && canGoTo(s.n)
            return (
              <li key={s.n} className="steps__item" data-state={state}>
                {i > 0 && <span className="steps__rule" aria-hidden="true" />}
                <button
                  type="button" className="steps__btn" disabled={!go}
                  aria-current={state === 'current' ? 'step' : undefined}
                  onClick={() => go && onGoTo(s.n)}
                >
                  <span className="steps__n t-label-s">
                    {state === 'done' ? <Checkmark size={12} aria-label="Done" /> : s.n}
                  </span>
                  <span className="t-label-m">{s.label}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="topbar__right">
        <span className="pill"><Security size={14} /> Nothing leaves your device</span>
        <button
          type="button" className="icon-btn icon-btn--outline"
          onClick={onToggleTheme}
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {dark ? <Light size={16} /> : <Asleep size={16} />}
        </button>
      </div>

      {busy && <span className="sr-only" role="status">Working…</span>}
    </header>
  )
}

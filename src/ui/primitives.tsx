import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ErrorFilled, Information, CheckmarkFilled, ChevronDown, Checkmark } from '@carbon/icons-react'

// ── Segmented ────────────────────────────────────────────────────────────────
export function Segmented<T extends string>({
  options, value, onChange, label, disabled,
}: {
  options: { value: T; label: ReactNode; disabled?: boolean }[]
  value: T | null
  onChange: (v: T) => void
  label: string
  disabled?: boolean
}) {
  const name = useId()
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const id = `${name}-${o.value}`
        return (
          <div className="seg__opt" key={o.value}>
            <input
              type="radio" id={id} name={name} value={o.value}
              checked={value === o.value} disabled={disabled || o.disabled}
              onChange={() => onChange(o.value)}
            />
            <label htmlFor={id}>{o.label}</label>
          </div>
        )
      })}
    </div>
  )
}

// ── Toggle ───────────────────────────────────────────────────────────────────
export function Toggle({ checked, onChange, label, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean
}) {
  return (
    <span className="toggle">
      <input
        type="checkbox" role="switch" aria-label={label}
        checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle__track" />
      <span className="toggle__knob" />
    </span>
  )
}

// ── Setting row ──────────────────────────────────────────────────────────────
export function Setting({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="setting">
      <div className="setting__text">
        <span className="setting__label">{label}</span>
        {hint && <span className="setting__hint">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

// ── Select (listbox menu) ────────────────────────────────────────────────────
// Design-system menu instead of the OS picker. ARIA listbox pattern:
// trigger (aria-haspopup / aria-expanded) opens a list whose active option is
// tracked with aria-activedescendant, so focus stays on the list.
// Keys: ↓/↑/Enter/Space open; in the list ↑ ↓ Home End move, Enter/Space
// pick, Esc closes back to the trigger, Tab closes, letters jump.
// Motion: opens from its trigger edge (scale + fade, --dur-dropdown); closes
// faster (--dur-tooltip). It flips above when there's no room below.
export type SelectOption = { value: string; label: string; hint?: string }

export function Select({ label, value, onChange, options, disabled }: {
  label: string; value: string; onChange: (v: string) => void
  options: SelectOption[]; disabled?: boolean
}) {
  const id = useId()
  const wrap = useRef<HTMLSpanElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [state, setState] = useState<'closed' | 'open' | 'closing'>('closed')
  const [active, setActive] = useState(0)
  const [above, setAbove] = useState(false)
  const current = options.find((o) => o.value === value) ?? options[0]
  const open = state === 'open'

  const show = (at = Math.max(0, options.findIndex((o) => o.value === value))) => {
    if (disabled) return
    const r = trigger.current?.getBoundingClientRect()
    // ~ room the menu needs; flip when the viewport can't fit it below
    if (r) setAbove(window.innerHeight - r.bottom < options.length * 64 + 24 && r.top > window.innerHeight - r.bottom)
    setActive(at); setState('open')
  }
  const hide = (refocus: boolean) => {
    setState((s) => (s === 'open' ? 'closing' : s))
    if (refocus) trigger.current?.focus()
  }
  const pick = (i: number) => { onChange(options[i].value); hide(true) }

  useEffect(() => { if (open) list.current?.focus() }, [open])
  useEffect(() => {
    if (!open) return
    const onDoc = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) hide(false) }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [open])
  useEffect(() => { if (disabled && state !== 'closed') setState('closed') }, [disabled, state])

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show() }
  }
  const onListKey = (e: React.KeyboardEvent) => {
    const last = options.length - 1
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(last, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(last) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(active) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide(true) }
    else if (e.key === 'Tab') hide(false)
    else if (e.key.length === 1) {
      const k = e.key.toLowerCase()
      const i = options.findIndex((o, j) => j > active && o.label.toLowerCase().startsWith(k))
      const j = i >= 0 ? i : options.findIndex((o) => o.label.toLowerCase().startsWith(k))
      if (j >= 0) setActive(j)
    }
  }

  return (
    <span className="select" ref={wrap} data-open={open || undefined}>
      <button
        ref={trigger} type="button" className="select__trigger" disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} aria-label={`${label}: ${current.label}`}
        onClick={() => (open ? hide(true) : show())} onKeyDown={onTriggerKey}
      >
        <span>{current.label}</span>
        <ChevronDown size={16} aria-hidden="true" className="select__chev" />
      </button>
      {state !== 'closed' && (
        <ul
          ref={list} id={`${id}-list`} role="listbox" tabIndex={-1} aria-label={label}
          aria-activedescendant={`${id}-o${active}`}
          className="menu" data-side={above ? 'top' : 'bottom'} data-closing={state === 'closing' || undefined}
          onKeyDown={onListKey}
          onAnimationEnd={() => setState((s) => (s === 'closing' ? 'closed' : s))}
        >
          {options.map((o, i) => (
            <li
              key={o.value} id={`${id}-o${i}`} role="option" aria-selected={o.value === value}
              className="menu__item" data-active={i === active || undefined}
              onPointerMove={() => setActive(i)} onClick={() => pick(i)}
            >
              <span className="menu__text">
                <span className="menu__label">{o.label}</span>
                {o.hint && <span className="menu__hint">{o.hint}</span>}
              </span>
              <Checkmark size={16} aria-hidden="true" className="menu__check" />
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}

// ── Progress ─────────────────────────────────────────────────────────────────
export function Progress({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className="progress" role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <div className="progress__fill" style={{ '--p': v } as React.CSSProperties} />
    </div>
  )
}

export function Spinner({ large }: { large?: boolean }) {
  return <span className={`spinner${large ? ' spinner--l' : ''}`} aria-hidden="true" />
}

// ── Alert ────────────────────────────────────────────────────────────────────
export function Alert({ kind = 'info', title, children, icon }: {
  kind?: 'info' | 'error' | 'success'; title: ReactNode; children?: ReactNode; icon?: ReactNode
}) {
  const Icon = kind === 'error' ? ErrorFilled : kind === 'success' ? CheckmarkFilled : Information
  return (
    <div className={`alert alert--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {icon ?? <Icon size={16} />}
      <div>
        <div className="alert__title">{title}</div>
        {children && <div className="alert__body">{children}</div>}
      </div>
    </div>
  )
}

// ── Radio card ───────────────────────────────────────────────────────────────
export function RadioCard({ name, value, checked, onChange, title, desc, disabled }: {
  name: string; value: string; checked: boolean; onChange: () => void
  title: string; desc: string; disabled?: boolean
}) {
  return (
    <label className="radio-card">
      <input type="radio" name={name} value={value} checked={checked} disabled={disabled} onChange={onChange} />
      <span className="radio-card__box">
        <span className="radio-card__dot" />
        <span>
          <span className="radio-card__title">{title}</span>
          <span className="radio-card__desc">{desc}</span>
        </span>
      </span>
    </label>
  )
}

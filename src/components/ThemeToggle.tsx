import { useState, useEffect, useRef } from 'react'

const STORAGE_KEY = 'framestack-theme'
const ATTR = 'framestack-theme'

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.setAttribute(ATTR, theme)
  document.body.setAttribute(ATTR, theme)
}

export function useTheme() {
  const init = (): 'light' | 'dark' => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
    return getSystemTheme()
  }

  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const t = init()
    setTheme(t)
    applyTheme(t)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        const t = e.matches ? 'dark' : 'light'
        setTheme(t)
        applyTheme(t)
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    applyTheme(next)
    localStorage.setItem(STORAGE_KEY, next)
  }

  return { theme, toggle }
}

// ── Sun icon ──────────────────────────────────────────────────────────────
const SunIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 7a5 5 0 1 1 0 10A5 5 0 0 1 12 7zm0-5a1 1 0 0 1 1 1v1a1 1 0 0 1-2 0V3a1 1 0 0 1 1-1zm0 17a1 1 0 0 1 1 1v1a1 1 0 0 1-2 0v-1a1 1 0 0 1 1-1zM4.22 4.22a1 1 0 0 1 1.42 0l.7.7a1 1 0 0 1-1.42 1.42l-.7-.7a1 1 0 0 1 0-1.42zm13.44 13.44a1 1 0 0 1 1.41 0l.71.7a1 1 0 0 1-1.41 1.42l-.71-.71a1 1 0 0 1 0-1.41zM2 11h1a1 1 0 0 1 0 2H2a1 1 0 0 1 0-2zm19 0h1a1 1 0 0 1 0 2h-1a1 1 0 0 1 0-2zM5.64 17.66l-.7.7a1 1 0 0 1-1.42-1.41l.7-.7a1 1 0 0 1 1.42 1.41zm13.44-13.44l.7-.7a1 1 0 0 1 1.41 1.41l-.7.7a1 1 0 0 1-1.41-1.41z"/>
  </svg>
)

// ── Moon icon ─────────────────────────────────────────────────────────────
const MoonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 1.992a10 10 0 1 0 9.236 13.838c.341-.82-.476-1.644-1.298-1.31a6.5 6.5 0 0 1-6.864-10.787l.077-.08c.551-.63.113-1.653-.758-1.653h-.266l-.068-.006-.06-.002z"/>
  </svg>
)

// ── Toggle switch — pill style matching Framer ThemeToggle ────────────────
export default function ThemeToggle({ theme, toggle }: { theme: 'light' | 'dark'; toggle: () => void }) {
  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        position: 'relative',
        width: 48,
        height: 26,
        borderRadius: 100,
        border: '1px solid var(--border)',
        background: isDark ? 'var(--brand-tint)' : 'var(--gray-150)',
        cursor: 'pointer',
        padding: 3,
        display: 'flex',
        alignItems: 'center',
        transition: 'background var(--t-default), border-color var(--t-default)',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: 'var(--app-bg)',
          boxShadow: 'var(--shadow-xs)',
          transition: 'transform var(--t-default)',
          transform: isDark ? 'translateX(22px)' : 'translateX(0px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
          left: 3,
        }}
      >
        {isDark ? <MoonIcon /> : <SunIcon />}
      </span>
    </button>
  )
}

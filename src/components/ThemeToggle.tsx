import { useState, useEffect, useRef } from 'react'

// Theme state only; the switch itself lives in the Topbar

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

  // index.html already stamped the theme before first paint
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.getAttribute(ATTR) === 'dark' ? 'dark' : 'light'
  )
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

import { useEffect, useRef, useState } from 'react'

export function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Reads a duration token (e.g. --dur-count) in ms. */
export function tokenMs(name: string, fallback: number): number {
  if (typeof document === 'undefined') return fallback
  const n = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name))
  return Number.isFinite(n) ? n : fallback
}

/**
 * Percent count (M4): the shown value eases toward `target` over --dur-count.
 * Retargets from the current value when target moves mid-tween, so rapid
 * updates read as one continuous motion. Reduced motion: no tween.
 */
export function useTween(target: number): number {
  const [shown, setShown] = useState(target)
  const from = useRef(target)
  const cur = useRef(target)

  useEffect(() => {
    if (prefersReducedMotion()) { cur.current = target; setShown(target); return }
    from.current = cur.current
    const dur = tokenMs('--dur-count', 400)
    let start = -1
    let raf = 0
    const step = (now: number) => {
      if (start < 0) start = now
      const k = Math.min(1, (now - start) / dur)
      const e = 1 - Math.pow(1 - k, 4) // decelerate; matches --ease-out, never overshoots
      cur.current = from.current + (target - from.current) * e
      setShown(cur.current)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target])

  return shown
}

import { useEffect, useRef } from 'react'
import { LOGO_VIEWBOX, PETAL_GROUPS } from './petals'

/**
 * Jorge Logo — the portfolio's header mark, ported from Framer
 * (Jorge_Logo2.tsx for the entrance, AskJorgeAI's AvatarMark for the loop).
 *
 * Two behaviours, one rAF loop driving 64 petal opacities:
 *  1. Entrance build — once per session. Each petal fades 0.12 → 1; the
 *     per-petal ramp is 18% of the build time and the stagger is derived so
 *     the last petal lands exactly at --dur-logo-build (Framer algorithm).
 *  2. Busy cue — when work starts (`busy` turns true) the mark plays one of
 *     the portfolio's "thinking" phases once, a different one each time, and
 *     settles back to fully built. It never loops: heavy work (decoding,
 *     extraction, speech) keeps the main thread, and status text elsewhere
 *     carries progress. Between cues the rAF loop stops completely.
 *
 * Reduced motion: always fully built; status text elsewhere carries meaning.
 * rAF pauses in hidden tabs, so nothing runs in the background.
 */

const FLOOR = 0.12
const RAMP_RATIO = 0.18
const CORE_COUNT = 8
const SETTLE_MS = 240
const SESSION_KEY = 'vs-logo-built'

const PHASES = ['sequential', 'hold-all', 'collapse', 'half-build-retreat', 'core-out'] as const
/** Phases that read as a cue on their own (hold-all is only a pause between loop phases) */
const CUES = [0, 2, 3, 4]
type Phase = (typeof PHASES)[number]

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

function phaseDuration(name: Phase, total: number): number {
  switch (name) {
    case 'sequential': return total * 55 + 500
    case 'hold-all': return 500
    case 'collapse': return 500
    case 'half-build-retreat': return 1700
    case 'core-out': return total * 45 + 700
  }
}

function phaseOpacity(name: Phase, t: number, i: number, total: number): number {
  switch (name) {
    case 'sequential': {
      const l = t - i * 55
      return l > 0 ? FLOOR + clamp01(l / 280) * (1 - FLOOR) : FLOOR
    }
    case 'hold-all':
      return 1
    case 'collapse': {
      const keep = i === 0 || i === Math.floor(total / 2)
      return keep ? 1 : Math.max(FLOOR, 1 - clamp01(t / 400))
    }
    case 'half-build-retreat': {
      const half = Math.floor(total / 2)
      let op = FLOOR
      if (i < half) {
        const l = t - i * 45
        op = l > 0 ? FLOOR + clamp01(l / 260) * (1 - FLOOR) : FLOOR
      }
      if (t > 900) {
        const r = t - 900 - i * 30
        if (r > 0) op = Math.max(FLOOR, op - clamp01(r / 380) * 0.9)
      }
      return op
    }
    case 'core-out': {
      const isCore = i < CORE_COUNT
      const delay = isCore ? i * 35 : CORE_COUNT * 35 + 250 + (i - CORE_COUNT) * 35
      const l = t - delay
      return l > 0 ? FLOOR + clamp01(l / 260) * (1 - FLOOR) : FLOOR
    }
  }
}

let lastStartPhase = -1

function readMs(name: string, fallback: number): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}

type Props = {
  /** Rendered size in px; defaults to the --size-logo token */
  size?: number
  /** Play the entrance build (only the first time this session) */
  build?: boolean
  /** App is working: play the cue once when this turns true */
  busy?: boolean
  className?: string
}

export default function JorgeLogo({ size, build = true, busy = false, className }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const busyRef = useRef(busy)
  busyRef.current = busy
  const wakeRef = useRef<() => void>(() => {})
  useEffect(() => { if (busy) wakeRef.current() }, [busy])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const petals = Array.from(svg.querySelectorAll('path'))
    const total = petals.length
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const ops = new Float32Array(total).fill(1)
    const paint = () => { for (let i = 0; i < total; i++) petals[i].style.opacity = ops[i].toFixed(3) }

    if (reduced) { paint(); return }

    let alreadyBuilt = false
    try { alreadyBuilt = sessionStorage.getItem(SESSION_KEY) === '1' } catch { /* private mode */ }

    // Mode machine: build → idle ⇄ loop, with a short settle when work ends
    type Mode = 'build' | 'idle' | 'loop' | 'settle'
    let mode: Mode = build && !alreadyBuilt ? 'build' : 'idle'
    let modeStart = -1
    let phaseIdx = 0
    let settleFrom = ops.slice()

    const buildMs = readMs('--dur-logo-build', 1400)
    const ramp = Math.max(1, buildMs * RAMP_RATIO)
    const stagger = (Math.max(ramp + 1, buildMs) - ramp) / (total - 1)

    let cued = false // played for the current busy stretch
    const startLoop = (now: number) => {
      let k = Math.floor(Math.random() * CUES.length)
      if (CUES[k] === lastStartPhase) k = (k + 1) % CUES.length
      const idx = CUES[k]
      lastStartPhase = idx
      phaseIdx = idx
      cued = true
      mode = 'loop'
      modeStart = now
    }

    if (mode === 'build') ops.fill(FLOOR)
    paint()

    let raf = 0
    let prevMode: Mode | null = null
    const tick = (now: number) => {
      const wasIdle = prevMode === 'idle'
      prevMode = mode
      if (modeStart < 0) modeStart = now
      const t = now - modeStart

      // Hold the build until the page entrance starts (fonts in), so the mark
      // and the headline assemble together rather than one before the other
      const html = document.documentElement
      if (mode === 'build' && html.classList.contains('intro') && !html.classList.contains('intro-run')) {
        modeStart = now
      } else if (mode === 'build') {
        let going = false
        for (let i = 0; i < total; i++) {
          const l = t - i * stagger
          ops[i] = l > 0 ? FLOOR + clamp01(l / ramp) * (1 - FLOOR) : FLOOR
          if (ops[i] < 1) going = true
        }
        if (!going) {
          try { sessionStorage.setItem(SESSION_KEY, '1') } catch { /* ignore */ }
          mode = 'idle'; modeStart = now
        }
      } else if (mode === 'idle') {
        if (!busyRef.current) cued = false
        else if (!cued) startLoop(now)
      } else if (mode === 'loop') {
        const name = PHASES[phaseIdx]
        for (let i = 0; i < total; i++) ops[i] = phaseOpacity(name, t, i, total)
        if (t > phaseDuration(name, total)) { mode = 'settle'; modeStart = now; settleFrom = ops.slice() }
      } else if (mode === 'settle') {
        const k = clamp01(t / SETTLE_MS)
        const e = 1 - Math.pow(1 - k, 3) // ease-out, no overshoot (opacity)
        for (let i = 0; i < total; i++) ops[i] = settleFrom[i] + (1 - settleFrom[i]) * e
        if (k >= 1) { mode = 'idle'; modeStart = now }
      }

      if (!(mode === 'idle' && wasIdle)) paint() // steady idle = fully built; skip
      // Fully built and nothing to cue: stop until busy turns true again
      if (mode === 'idle' && wasIdle && (!busyRef.current || cued)) { raf = 0; if (!busyRef.current) cued = false; return }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    wakeRef.current = () => { if (!raf) { cued = false; prevMode = null; raf = requestAnimationFrame(tick) } }
    return () => { cancelAnimationFrame(raf); wakeRef.current = () => {} }
  }, [build])

  const px = size ?? 32
  return (
    <svg
      ref={svgRef}
      className={className}
      width={px}
      height={px}
      viewBox={`0 0 ${LOGO_VIEWBOX} ${LOGO_VIEWBOX}`}
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flex: 'none' }}
    >
      {PETAL_GROUPS.map((g, gi) => (
        <g key={gi} fill={g.color}>
          {g.paths.map((d, pi) => <path key={pi} d={d} />)}
        </g>
      ))}
    </svg>
  )
}

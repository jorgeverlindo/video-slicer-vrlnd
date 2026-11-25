import { useRef, useLayoutEffect, type ReactNode } from 'react'
import {
  Add, Asleep, Checkmark, Copy, DocumentDownload, Download, Light, Link, Maximize, Microphone,
  PlayFilledAlt, PlayOutline, Reset, Security, Subtract, Upload, Video, VolumeUp,
} from '@carbon/icons-react'
import { FileArchive } from 'lucide-react'
import { Count, Stage, Stream, Window, type Act, type Layout, type Point, type Theme } from '../stageshow-kit'
import { Progress, RadioCard, Segmented, Setting, Spinner, Toggle } from '../../ui/primitives'
import JorgeLogo from '../../brand/JorgeLogo'
import { CallPoster, FRAMES } from './frames'
import './demo.css'

// Video Slicer, How it works. One loop told in two chapters, on the app's
// current interface: the page is built from the app's own components and
// classes (topbar, home, slice panel, result tiles), drawn at a reduced zoom
// inside a browser window, so it can never drift from the real screens.
//
// Chapter 1, upload and extract: a recorded usability session is dragged
// from the desktop onto the home; the Slice screen opens on it. The cursor
// keeps only unique frames, turns on Transcribe audio, confirms the language
// and starts the transcript; the speech model loads while Extract slices
// the video, and the Result screen deals seven frames.
//
// Chapter 2, read and export: the Transcript tab streams the session's lines
// with their timecodes; back on Frames the transcript goes into the ZIP,
// Download all frames packs it, and the archive lands on the desktop under
// the video it came from. Start over is the visible reset back to the home.
//
// Every frame is an illustration of a moment in the call, in the app's own
// palette: no real faces, names or client assets. The transcript is written
// for the demo, not taken from the recording.

const FILE = 'user-test.mp4'
const ZIP = 'user-test_frames.zip'

const LANGS = [
  { label: 'English', hint: 'Small model, ready in seconds' },
  { label: 'Portuguese', hint: 'One-time 460 MB download' },
]

const LINES = [
  { t: '0:05', text: 'Thanks for joining. Today we’ll look at bulk editing.' },
  { t: '1:05', text: 'I’d start by filtering the lifestyle images first.' },
  { t: '4:05', text: 'This dialog asks which fields to overwrite. That’s clear.' },
  { t: '6:05', text: 'Five selected, and the panel shows what they share.' },
  { t: '11:05', text: 'Opening one, I can check its tags in context.' },
]
const WORDS = LINES.map((l) => l.text.split(' ').length)
const TOTAL_WORDS = WORDS.reduce((a, b) => a + b, 0)

const SCANNED = 30 // moments the interval finds; unique frames keeps 7

type Ghost = { on: boolean; dropped: boolean; off: Point; at: Point }
type Screen = 'home' | 'slice' | 'result'
type Tx = 'idle' | 'download' | 'transcribing' | 'done'

type S = {
  ghost: Ghost
  screen: Screen
  unique: boolean
  tx: boolean
  lang: 'closed' | 'open' | 'closing'
  hoverLang: number | undefined
  txStatus: Tx
  pct: number
  extracting: boolean
  scanned: number
  frames: number
  tab: 'frames' | 'transcript'
  words: number
  include: boolean
  zip: 'idle' | 'packing' | 'done'
  downloads: boolean
  /** Page scroll, in the app's own pixels */
  scroll: number
}

const NO_GHOST: Ghost = { on: false, dropped: false, off: { x: 0, y: 0 }, at: { x: 0, y: 0 } }

const initial: S = {
  ghost: NO_GHOST,
  screen: 'home',
  unique: false,
  tx: false,
  lang: 'closed',
  hoverLang: undefined,
  txStatus: 'idle',
  pct: 0,
  extracting: false,
  scanned: 0,
  frames: 0,
  tab: 'frames',
  words: 0,
  include: false,
  zip: 'idle',
  downloads: false,
  scroll: 0,
}

// Where chapter 2 begins: everything chapter 1 did, already done
const CH2_START: Partial<S> = {
  ghost: NO_GHOST, screen: 'result', unique: true, tx: true, lang: 'closed', hoverLang: undefined,
  txStatus: 'done', pct: 100, extracting: false, scanned: SCANNED, frames: FRAMES.length,
  tab: 'frames', words: 0, include: false, zip: 'idle', downloads: false, scroll: 0,
}

// The payoff, for reduced motion and thumbnails: frames and transcript out,
// the ZIP on the desktop beside the video it came from
const poster: S = { ...initial, ...CH2_START, words: TOTAL_WORDS, include: true, zip: 'done', downloads: true } as S

/** The page is the app at its own size, zoomed into the window */
const ZOOM: Record<Layout, number> = { wide: 0.62, compact: 0.66 }

type Geo = { win: { x: number; y: number; w: number; h: number }; desk: { x: number; y: number }; zip: { x: number; y: number } }
const GEO: Record<Layout, Geo> = {
  wide: { win: { x: 160, y: 32, w: 688, h: 1000 }, desk: { x: 24, y: 32 }, zip: { x: 24, y: 164 } },
  compact: { win: { x: 16, y: 80, w: 326, h: 1200 }, desk: { x: 16, y: 16 }, zip: { x: 190, y: 16 } },
}

export type Chapter = 1 | 2

function makeScript(onChapter: (c: Chapter) => void, startAt: { current: Chapter }) {
  return async function script(a: Act<S>) {
    const zoom = ZOOM[a.layout]
    const bottom = () => a.rect('stage-floor').y
    // Scroll the page just enough to bring a target's foot into the window
    const reveal = async (target: string, room = 24) => {
      const r = a.rect(target)
      const over = r.y + r.height + room - bottom()
      if (over <= 0) return
      await a.set((s) => ({ scroll: s.scroll + over / zoom }))
      await a.wait(700)
    }

    // A chapter picked in the host starts the first run there; later loops
    // play the whole story from the top
    const start = startAt.current
    startAt.current = 1
    if (start === 2) {
      await a.snap(CH2_START)
      onChapter(2)
      await a.wait(500)
    } else {
      onChapter(1)
      await a.wait(300)

      // 1. Drag the recording off the desktop onto the home
      a.mark('grab')
      const thumb = a.rect('desk-thumb')
      const file = a.rect('desk-file')
      const grab = { x: thumb.x + thumb.width * 0.5, y: thumb.y + thumb.height * 0.55 }
      await a.move(grab)
      await a.wait(220)
      const off = { x: grab.x - file.x, y: grab.y - file.y }
      const drop = a.rect('drop')
      a.mark('drag')
      await a.drag({ x: drop.x + drop.width * 0.42, y: drop.y + drop.height * 0.5 }, (at) => {
        a.put({ ghost: { on: true, dropped: false, off, at } })
      }, { duration: 1300, cursor: 'preserve' })

      // 2. Drop: the Slice screen opens on the video
      a.mark('drop')
      await a.set((s) => ({ ghost: { ...s.ghost, dropped: true }, screen: 'slice' }))
      await a.wait(1000)

      // 3. Keep only unique frames
      a.mark('unique')
      await a.click('unique')
      await a.set({ unique: true })
      await a.wait(500)

      // 4. Transcribe audio: its options open; the page follows them down
      a.mark('transcript')
      await a.click('transcribe')
      await a.set({ tx: true })
      await a.wait(320)
      await reveal('extract')

      // 5. Confirm the language
      await a.click('lang')
      await a.set({ lang: 'open' })
      await a.wait(380)
      await a.move('lang-0')
      a.put({ hoverLang: 0 })
      await a.wait(260)
      a.mark('pick')
      await a.click('lang-0')
      await a.set({ lang: 'closing' })
      await a.wait(160)
      a.put({ lang: 'closed', hoverLang: undefined })
      await a.wait(200)

      // 6. Start the transcript: the speech model loads (only the first time)
      a.mark('start')
      await a.click('start')
      await a.set({ txStatus: 'download' })
      for (const pct of [28, 61, 88, 100]) {
        a.put({ pct })
        await a.wait(300)
      }
      a.put({ txStatus: 'transcribing' })
      await a.wait(300)

      // 7. Extract: the panel scans and keeps the frames that change
      a.mark('extract')
      await a.click('extract')
      await a.set({ extracting: true, scroll: 0 })
      for (let n = 3; n <= SCANNED; n += 3) {
        a.put({ scanned: n })
        await a.wait(120)
      }
      await a.wait(250)

      // 8. Result: seven frames dealt onto the page
      await a.set({ screen: 'result', extracting: false, txStatus: 'done' })
      await a.wait(200)
      for (let i = 1; i <= FRAMES.length; i++) {
        a.put({ frames: i })
        await a.wait(110)
      }
      await a.wait(1500)

      onChapter(2)
    }

    // Chapter 2: read the transcript, then export
    a.mark('tab')
    await a.click('tab-transcript')
    await a.set({ tab: 'transcript' })
    await a.wait(300)
    await reveal('tx-end', 16)
    for (let w = 1; w <= TOTAL_WORDS; w++) {
      a.put({ words: w })
      await a.wait(32)
    }
    await a.wait(1500)

    await a.set({ scroll: 0 })
    await a.wait(700)
    await a.click('tab-frames')
    await a.set({ tab: 'frames' })
    await a.wait(500)
    a.mark('include')
    await a.click('include')
    await a.set({ include: true })
    await a.wait(450)

    a.mark('download')
    await a.click('zip')
    await a.set({ zip: 'packing' })
    await a.wait(1000)
    await a.set({ zip: 'done', downloads: true })
    a.mark('payoff')
    await a.wait(2400)

    // Reset with a cause: Start over takes the page back to the home
    a.mark('clear')
    await a.click('start-over')
    await a.set({ screen: 'home', downloads: false, ghost: NO_GHOST })
    await a.move(a.layout === 'compact' ? HOME.compact : HOME.wide)
    await a.snap({
      unique: false, tx: false, txStatus: 'idle', pct: 0, scanned: 0, frames: 0,
      tab: 'frames', words: 0, include: false, zip: 'idle', scroll: 0,
    })
    await a.wait(300)
  }
}

const HOME = { wide: { x: 120, y: 300 }, compact: { x: 300, y: 40 } }

export type HowItWorksProps = {
  theme?: Theme
  onChapter?: (c: Chapter) => void
  /** The chapter the first run starts at. To jump, remount with a new key. */
  startAt?: Chapter
  /** 'card' frames the loop at 4:3 (880×660) for 4:3 slots such as a product card. */
  frame?: 'wide' | 'card'
}

export default function HowItWorks({ theme = 'light', onChapter, startAt = 1, frame = 'wide' }: HowItWorksProps) {
  const card = frame === 'card'
  const chapter = useRef(onChapter)
  chapter.current = onChapter
  const start = useRef<Chapter>(startAt)
  const script = useRef(makeScript((c) => chapter.current?.(c), start)).current

  return (
    <Stage<S>
      width={880}
      height={card ? 660 : 500}
      compact={{ below: 600, width: 358, height: 620 }}
      initial={initial}
      poster={poster}
      script={script}
      theme={theme}
      cursor={{ at: HOME }}
      className="vsd"
    >
      {(s, _rect, layout) => {
        const g = GEO[layout]
        const lifted = s.ghost.on && !s.ghost.dropped
        return (
          <>
            <span className="vsd-floor" data-target="stage-floor" aria-hidden />

            <div className="vsd-desk" data-target="desk-file" data-lifted={lifted || undefined} style={{ left: g.desk.x, top: g.desk.y }}>
              <span className="vsd-desk__thumb" data-target="desk-thumb">
                <CallPoster className="vsd-art" />
              </span>
              <span className="vsd-desk__name">{FILE}</span>
            </div>

            <div className="vsd-desk vsd-zip" data-on={s.downloads || undefined} style={{ left: g.zip.x, top: g.zip.y }}>
              <span className="vsd-desk__thumb vsd-zip__tile">
                <FileArchive size={20} strokeWidth={1.5} />
                <span className="vsd-zip__count">7 frames + transcript</span>
              </span>
              <span className="vsd-desk__name">{ZIP}</span>
            </div>

            <Browser layout={layout} style={{ left: g.win.x, top: g.win.y, width: g.win.w, height: g.win.h }}>
              <div
                className="vsd-page"
                data-compact={layout === 'compact' || undefined}
                style={{ zoom: ZOOM[layout], '--vsd-scroll': `${-s.scroll}px` } as React.CSSProperties}
                {...{ inert: '' }}
              >
                <Topbar screen={s.screen} theme={theme} />
                <div className="vsd-screens">
                  <section className="vsd-screen" data-on={s.screen === 'home' || undefined}><Home /></section>
                  <section className="vsd-screen" data-on={s.screen === 'slice' || undefined}><Slice s={s} /></section>
                  <section className="vsd-screen" data-on={s.screen === 'result' || undefined}><Result s={s} /></section>
                </div>
              </div>
            </Browser>

            <DragImage ghost={s.ghost}>
              <span className="vsd-desk__thumb"><CallPoster className="vsd-art" /></span>
              <span className="vsd-drag__name">{FILE}</span>
            </DragImage>
          </>
        )
      }}
    </Stage>
  )
}

/* ---------- The window ---------------------------------------------- */

/** Wide: the app in a quiet browser window. Compact (a phone column): the
 *  page itself on a panel, since browser chrome at 326px wide would only
 *  crowd it. */
function Browser({ layout, style, children }: { layout: Layout; style: React.CSSProperties; children: ReactNode }) {
  if (layout === 'compact') {
    return (
      <div className="ss-window vsd-win vsd-mobile" style={style}>
        <div className="vsd-body">{children}</div>
      </div>
    )
  }
  return (
    <Window className="vsd-win" url="videoslicer.jorgeverlindo.design" urlShape="pill" style={style} body={{ className: 'vsd-body' }}>
      {children}
    </Window>
  )
}

/* ---------- The app's topbar ---------------------------------------- */

const STEPS: { label: string; at: Screen }[] = [
  { label: 'Video', at: 'home' },
  { label: 'Slice', at: 'slice' },
  { label: 'Result', at: 'result' },
]
const ORDER: Screen[] = ['home', 'slice', 'result']

function Topbar({ screen, theme }: { screen: Screen; theme: Theme }) {
  const now = ORDER.indexOf(screen)
  return (
    <header className="topbar vsd-topbar">
      <div className="brand">
        <span className="brand__home">
          <JorgeLogo size={32} build={false} />
          <span className="brand__name t-title-s">Video Slicer</span>
        </span>
        <span className="brand__by t-caption">by <span>Jorge Verlindo</span></span>
      </div>
      <nav className="steps">
        <ol>
          {STEPS.map((st, i) => {
            const state = i < now ? 'done' : i === now ? 'current' : 'todo'
            return (
              <li key={st.label} className="steps__item" data-state={state}>
                {i > 0 && <span className="steps__rule" />}
                <span className="steps__btn">
                  <span className="steps__n t-label-s">{state === 'done' ? <Checkmark size={12} /> : i + 1}</span>
                  <span className="t-label-m">{st.label}</span>
                </span>
              </li>
            )
          })}
        </ol>
      </nav>
      <div className="topbar__right">
        <span className="pill"><Security size={14} /> Nothing leaves your device</span>
        <span className="icon-btn icon-btn--outline">{theme === 'dark' ? <Light size={16} /> : <Asleep size={16} />}</span>
      </div>
    </header>
  )
}

/* ---------- Home ------------------------------------------------------ */

const STILLS = [
  { n: '01', label: '#004', t: '00:00:04.0', cls: 'still--back' },
  { n: '02', label: '#009', t: '00:00:08.0', cls: 'still--top' },
  { n: '03', label: '#013', t: '00:00:13.0', cls: 'still--front' },
] as const

function Home() {
  return (
    <div className="vsd-home" data-target="drop" data-drop>
      <div className="home__copy">
        <h1 className="t-display-xl home__title">
          <span>Drop a video.</span>
          <span>Keep every frame.</span>
        </h1>
        <p className="t-body-l c-subtle home__lede">
          Pull stills, a transcript or a storyboard out of any clip, right in your browser.
          The file never leaves your machine.
        </p>
        <div>
          <div className="home__actions">
            <span className="btn btn--primary btn--l"><Upload size={16} /> Choose a video</span>
            <span className="btn btn--secondary btn--l"><Link size={16} /> Paste a link</span>
            <span className="btn btn--link btn--l"><PlayOutline size={16} /> <span>See how it works</span></span>
          </div>
          <p className="t-caption c-subtle home__note">Works with MP4, MOV, WebM and MKV</p>
        </div>
        <div className="home__transcribe">
          <Toggle checked={false} onChange={() => {}} label="Also transcribe the audio" />
          <span className="t-label-m">Also transcribe the audio</span>
          <span className="select"><span className="select__trigger" aria-disabled><span>English</span></span></span>
        </div>
      </div>

      <div className="stills vsd-stills">
        {STILLS.map((c) => (
          <figure key={c.n} className={`still ${c.cls}`}>
            <span className="still__media">
              <img className="still__img still__img--light" src={`/hero/trajectory-${c.n}-light.webp`} alt="" draggable={false} />
              <img className="still__img still__img--dark" src={`/hero/trajectory-${c.n}-dark.webp`} alt="" draggable={false} />
            </span>
            <figcaption>
              <span className="t-mono-s">{c.label}</span>
              <span className="t-mono-s">{c.t}</span>
            </figcaption>
          </figure>
        ))}
      </div>

      <div className="home__drop">
        <Upload size={32} />
        <span className="t-title-m">Drop the video here</span>
      </div>
    </div>
  )
}

/* ---------- Slice ----------------------------------------------------- */

const PRESETS = [
  { value: 'interval', title: 'Interval', desc: 'Every few seconds' },
  { value: 'count', title: 'Fixed count', desc: 'Spread evenly' },
  { value: 'custom', title: 'Custom', desc: 'Moments you pick' },
  { value: 'storyboard', title: 'Storyboard', desc: 'One per spoken line' },
]
const QUALITY = ['Draft', 'Good', 'High', 'Max'].map((l) => ({ value: l.toLowerCase(), label: l }))
const noop = () => {}

function Slice({ s }: { s: S }) {
  return (
    <div className="vsd-slice">
      <div className="slice__media">
        <div className="file-row">
          <Video size={16} />
          <span className="file-row__name t-label-m">{FILE}</span>
          <span className="btn btn--ghost">Replace video</span>
        </div>
        <Player />
        <Strip />
      </div>
      <aside className="panel vsd-panel">
        <div className="vsd-panel__swap" data-on={!s.extracting || undefined}><Settings s={s} /></div>
        <div className="vsd-panel__swap vsd-panel__over" data-on={s.extracting || undefined}><Processing s={s} /></div>
      </aside>
    </div>
  )
}

function Player({ time = '00:00:00.000' }: { time?: string }) {
  return (
    <div className="player">
      <CallPoster className="player__video" />
      <div className="player__scrim" />
      <div className="player__controls">
        <span className="player__play"><PlayFilledAlt size={16} /></span>
        <span className="t-mono-m player__time">{time} <span className="player__dur">/ 00:30:29.000</span></span>
        <span className="player__spacer" />
        <span className="icon-btn player__icon"><VolumeUp size={16} /></span>
        <span className="icon-btn player__icon"><Maximize size={16} /></span>
      </div>
    </div>
  )
}

function Strip() {
  const cells = [0, 0, 1, 1, 2, 3, 3, 4, 5, 6, 6, 6]
  return (
    <div className="filmstrip">
      <div className="filmstrip__track">
        <div className="filmstrip__marks">
          {Array.from({ length: 13 }, (_, i) => <span key={i} className="filmstrip__tick" style={{ left: `${(i / 12) * 100}%` }} />)}
        </div>
        <div className="filmstrip__strip">
          {cells.map((f, i) => {
            const { Art } = FRAMES[f]
            return <span key={i} className="filmstrip__cell"><Art className="vsd-art" /></span>
          })}
        </div>
        <span className="filmstrip__head" style={{ left: '0%' }} />
      </div>
      <div className="filmstrip__labels t-mono-s c-subtle"><span>0:00</span><span>30:29</span></div>
    </div>
  )
}

function Settings({ s }: { s: S }) {
  const status = s.txStatus
  return (
    <div className="panel__body">
      <header className="panel__head"><h2 className="t-title-m">How should we slice it?</h2></header>
      <fieldset className="presets">
        {PRESETS.map((o) => (
          <RadioCard key={o.value} name="vsd-mode" value={o.value} title={o.title} desc={o.desc} checked={o.value === 'interval'} onChange={noop} />
        ))}
      </fieldset>
      <hr className="divider" />
      <div className="panel__rows">
        <Setting label="One frame every" hint="Shorter gaps catch more motion">
          <div className="stepper">
            <span className="icon-btn"><Subtract size={16} /></span>
            <span className="stepper__value">60.0 s</span>
            <span className="icon-btn"><Add size={16} /></span>
          </div>
        </Setting>
        <div className="vsd-hit" data-target="unique" data-cursor="pointer">
          <Setting label="Only unique frames" hint="Skips near-identical shots">
            <Toggle checked={s.unique} onChange={noop} label="Only unique frames" />
          </Setting>
        </div>
        <div className="field">
          <span className="field__label">Image quality</span>
          <Segmented label="Image quality" value="high" onChange={noop} options={QUALITY} />
        </div>
      </div>

      <hr className="divider" />
      <section className="tx-section">
        <div className="vsd-hit" data-target="transcribe" data-cursor="pointer">
          <Setting label="Transcribe audio" hint="Runs on your device">
            <Toggle checked={s.tx} onChange={noop} label="Transcribe audio" />
          </Setting>
        </div>
        <div className="tx-reveal" data-open={s.tx || undefined}>
          <div className="tx-options">
            <Setting label="Language" hint={LANGS[0].hint}>
              <span className="select" data-open={s.lang === 'open' || undefined}>
                <span className="select__trigger" data-target="lang" data-cursor="pointer">
                  <span>English</span>
                  <svg className="select__chev" width="16" height="16" viewBox="0 0 32 32" fill="currentColor"><path d="M16 22 6 12l1.4-1.4 8.6 8.6 8.6-8.6L26 12z" /></svg>
                </span>
                {s.lang !== 'closed' && (
                  <ul className="menu" data-side="bottom" data-closing={s.lang === 'closing' || undefined}>
                    {LANGS.map((o, i) => (
                      <li key={o.label} className="menu__item" data-active={s.hoverLang === i || undefined} aria-selected={i === 0} data-target={`lang-${i}`} data-cursor="pointer">
                        <span className="menu__text">
                          <span className="menu__label">{o.label}</span>
                          <span className="menu__hint">{o.hint}</span>
                        </span>
                        <Checkmark size={16} className="menu__check" />
                      </li>
                    ))}
                  </ul>
                )}
              </span>
            </Setting>
            <div className="vsd-swap">
              <span className="vsd-swap__item" data-on={status === 'idle' || undefined}>
                <span className="btn btn--secondary btn--block" data-target="start" data-cursor="pointer">Start transcription</span>
              </span>
              <span className="vsd-swap__item" data-on={status === 'download' || status === 'transcribing' || undefined}>
                <span className="tx-line">
                  <Spinner />
                  <span className="field__hint">
                    {status === 'download'
                      ? <>Downloading the speech model, <Count value={s.pct} duration={280} format={(n) => String(Math.round(n))} />%</>
                      : 'Transcribing…'}
                  </span>
                </span>
              </span>
              <span className="vsd-swap__item" data-on={status === 'done' || undefined}>
                <p className="field__hint">Transcript ready, {LINES.length} lines.</p>
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="panel__action">
        <span className="btn btn--primary btn--l btn--block" data-target="extract" data-cursor="pointer">
          {s.unique ? 'Extract unique frames' : `Extract ${SCANNED} frames`}
        </span>
        <p className="t-caption c-subtle vsd-hint" data-on={s.unique || undefined}>Scans {SCANNED} moments and keeps the ones that change</p>
      </div>
    </div>
  )
}

function Processing({ s }: { s: S }) {
  const kept = Math.round((s.scanned / SCANNED) * FRAMES.length)
  const pct = Math.round((s.scanned / SCANNED) * 100)
  return (
    <div className="panel__body">
      <header className="processing__head">
        <p className="t-label-m c-subtle">Slicing your video</p>
        <p className="t-display-l processing__pct">{pct}%</p>
        <p className="t-body-m c-subtle">Scanned {s.scanned} of {SCANNED}, kept {kept}.</p>
      </header>
      <Progress value={pct / 100} label="Slicing progress" />
      <div className="arrivals">
        {Array.from({ length: 4 }, (_, i) => {
          const idx = kept - 4 + i
          const f = idx >= 0 ? FRAMES[idx] : null
          return f
            ? <span key={f.time} className="arrivals__img vsd-arrival"><f.Art className="vsd-art" /></span>
            : <span key={`e${i}`} className="arrivals__empty" />
        })}
      </div>
      <hr className="divider" />
      <div className="tx-card">
        <div className="tx-card__row"><Microphone size={16} /><span className="t-label-m">Transcribing</span></div>
        <p className="t-caption c-subtle">Runs on your device while the frames come out.</p>
      </div>
      <div className="panel__action">
        <span className="btn btn--secondary btn--l btn--block">Cancel</span>
      </div>
    </div>
  )
}

/* ---------- Result ---------------------------------------------------- */

function Result({ s }: { s: S }) {
  return (
    <div className="result">
      <header className="result__head">
        <div>
          <h1 className="t-display-l">{FRAMES.length} frames</h1>
          <p className="t-body-m c-subtle">From {FILE}, unique frames only. 1920 × 1080 JPEG, 1.4 MB in total.</p>
        </div>
        <div className="result__actions">
          <span className="btn btn--ghost btn--l" data-target="start-over" data-cursor="pointer"><Reset size={16} /> Start over</span>
          <span className="btn btn--secondary btn--l vsd-dl" data-target="zip" data-cursor="pointer">
            <span className="vsd-swap vsd-swap--icon">
              <span className="vsd-swap__item" data-on={s.zip === 'idle' || undefined}><Download size={16} /></span>
              <span className="vsd-swap__item" data-on={s.zip === 'packing' || undefined}><Spinner /></span>
              <span className="vsd-swap__item" data-on={s.zip === 'done' || undefined}><Checkmark size={16} /></span>
            </span>
            <span className="vsd-swap vsd-swap--label">
              <span className="vsd-swap__item" data-on={s.zip === 'idle' || undefined}>Download all frames</span>
              <span className="vsd-swap__item" data-on={s.zip === 'packing' || undefined}>Packing…</span>
              <span className="vsd-swap__item" data-on={s.zip === 'done' || undefined}>Downloaded</span>
            </span>
          </span>
        </div>
      </header>

      <div className="result__tabs">
        <div className="tabs">
          <span className="tab" aria-selected={s.tab === 'frames'} data-target="tab-frames" data-cursor="pointer">
            Frames <span className="chip-count">{FRAMES.length}</span>
          </span>
          <span className="tab" aria-selected={s.tab === 'transcript'} data-target="tab-transcript" data-cursor="pointer">
            Transcript <span className="chip-count">{LINES.length}</span>
          </span>
        </div>
        <span className="result__include t-label-m vsd-include" data-show={s.tab === 'frames' || undefined} data-target="include" data-cursor="pointer">
          <Toggle checked={s.include} onChange={noop} label="Include transcript in ZIP" /> Include transcript in ZIP
        </span>
      </div>

      <div className="result__panel vsd-panels">
        <ul className="tiles vsd-tiles" data-show={s.tab === 'frames' || undefined}>
          {FRAMES.map(({ Art, time }, i) => (
            <li key={time} className="tile vsd-tile" data-on={i < s.frames || undefined} style={{ '--i': i } as React.CSSProperties}>
              <span className="tile__select">
                <Art className="vsd-tile__img" />
                <span className="tile__scrim" />
                <span className="tile__meta">
                  <span className="t-mono-s">{String(i + 1).padStart(3, '0')}</span>
                  <span className="t-mono-s">{time}.000</span>
                </span>
              </span>
            </li>
          ))}
        </ul>

        <div className="tx vsd-tx" data-show={s.tab === 'transcript' || undefined}>
          <div className="tx__media"><Player time="00:00:05.000" /></div>
          <section className="tx__body">
            <header className="tx__head">
              <h2 className="t-title-s">Transcript</h2>
              <div className="tx__tools">
                <span className="btn btn--ghost"><Copy size={16} /> Copy</span>
                <span className="btn btn--secondary"><DocumentDownload size={16} /> Download .md</span>
              </div>
            </header>
            <ol className="tx__lines">
              {LINES.map((l, i) => {
                const before = WORDS.slice(0, i).reduce((x, y) => x + y, 0)
                const count = Math.max(0, Math.min(WORDS[i], s.words - before))
                return (
                  <li key={l.t}>
                    <span className="tx-line-btn vsd-line" data-on={count > 0 || undefined} data-active={i === 0 || undefined}>
                      <span className="t-mono-s c-subtle">{l.t}</span>
                      <Stream className="t-transcript" text={l.text} count={count} />
                    </span>
                  </li>
                )
              })}
            </ol>
            <span data-target="tx-end" />
          </section>
        </div>
      </div>
    </div>
  )
}

/* ---------- Drag image (after examples/upload) ----------------------- */

function DragImage({ ghost, children }: { ghost: Ghost; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const over = useRef<HTMLElement | null>(null)
  const following = ghost.on && !ghost.dropped
  const { x: ox, y: oy } = ghost.off
  const { x, y } = ghost.at
  useLayoutEffect(() => {
    const root = ref.current?.closest<HTMLElement>('.ss-stage')
    let next: HTMLElement | null = null
    if (following && root) {
      // The page is inert (not hit-testable), so test the drop target's box
      const box = root.getBoundingClientRect()
      const scale = box.width / root.offsetWidth || 1
      const px = box.left + x * scale, py = box.top + y * scale
      const drop = root.querySelector<HTMLElement>('[data-drop]')
      const r = drop?.getBoundingClientRect()
      if (drop && r && px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) next = drop
    }
    if (next !== over.current) {
      over.current?.removeAttribute('data-over')
      next?.setAttribute('data-over', '')
      over.current = next
    }
  }, [following, x, y])
  useLayoutEffect(() => () => over.current?.removeAttribute('data-over'), [])
  return (
    <div ref={ref} className="vsd-drag" data-show={following || undefined} data-dropped={ghost.dropped || undefined} style={{ transform: `translate(${x - ox}px, ${y - oy}px)` }} aria-hidden>
      <div className="vsd-drag__inner" style={{ transformOrigin: `${ox}px ${oy}px` }}>
        {children}
      </div>
    </div>
  )
}

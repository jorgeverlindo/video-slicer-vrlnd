import { useRef, useLayoutEffect, type ReactNode } from 'react'
import { Check, ChevronDown, Download, FileArchive, FileImage, Mic, Sliders, Upload, Video } from 'lucide-react'
import { Button, Collapse, Count, Menu, Meter, Popover, Spinner, Stage, States, Stream, Tabs, Window, type Act, type Layout, type Point, type Theme } from '../stageshow-kit'
import { CallPoster, FRAMES } from './frames'
import './demo.css'

// Video Slicer, How it works. One loop told in two chapters.
//
// Chapter 1, upload and extract: a recorded usability session is dragged
// from the desktop into the dropzone; the workspace opens on it. The cursor
// keeps only unique frames, turns on the audio transcript and picks its
// language; the model loads and transcribes while Extract slices seven frames
// into the grid below, which the page scrolls to.
//
// Chapter 2, read and export: the Transcription tab streams the session's
// lines with their timecodes; back on Frames the transcript is included in
// the ZIP, Download packs it, and the archive lands on the desktop under the
// video it came from. Clear video is the visible reset back to the dropzone.
//
// Every frame is an illustration of a moment in the call, in the app's own
// palette: no real faces, names or client assets. The transcript is written
// for the demo, not taken from the recording.

const FILE = 'user-test.mp4'
const ZIP = 'frames.zip'

const LANGS = ['English', 'Portuguese', 'Spanish', 'French']

const LINES = [
  { t: '00:05', text: 'Thanks for joining. Today we’ll look at bulk editing.' },
  { t: '01:05', text: 'I’d start by filtering the lifestyle images first.' },
  { t: '04:05', text: 'This dialog asks which fields to overwrite. That’s clear.' },
  { t: '06:05', text: 'Five selected, and the panel shows what they share.' },
  { t: '11:05', text: 'Opening one, I can check its tags in context.' },
]
const WORDS = LINES.map((l) => l.text.split(' ').length)
const TOTAL_WORDS = WORDS.reduce((a, b) => a + b, 0)

type Ghost = { on: boolean; dropped: boolean; off: Point; at: Point }
type Model = 'idle' | 'download' | 'transcribing' | 'ready'

type S = {
  ghost: Ghost
  loaded: boolean
  unique: boolean
  transcript: boolean
  langOpen: boolean
  lang: number | null
  hoverLang: number | undefined
  model: Model
  pct: number
  extracting: boolean
  frames: number
  tab: 0 | 1
  words: number
  include: boolean
  zip: 'idle' | 'packing' | 'done'
  downloads: boolean
  scrolled: boolean
}

const NO_GHOST: Ghost = { on: false, dropped: false, off: { x: 0, y: 0 }, at: { x: 0, y: 0 } }

const initial: S = {
  ghost: NO_GHOST,
  loaded: false,
  unique: false,
  transcript: false,
  langOpen: false,
  lang: null,
  hoverLang: undefined,
  model: 'idle',
  pct: 0,
  extracting: false,
  frames: 0,
  tab: 0,
  words: 0,
  include: false,
  zip: 'idle',
  downloads: false,
  scrolled: false,
}

// The payoff, for reduced motion and thumbnails: everything done, the ZIP in
// the downloads popover over the finished grid.
const poster: S = {
  ...initial,
  loaded: true,
  unique: true,
  transcript: true,
  lang: 0,
  model: 'ready',
  pct: 100,
  frames: 7,
  words: TOTAL_WORDS,
  include: true,
  zip: 'done',
  downloads: true,
  scrolled: true,
}

type Geo = { win: { x: number; y: number; w: number; h: number }; desk: { x: number; y: number }; zip: { x: number; y: number } }
const GEO: Record<Layout, Geo> = {
  wide: { win: { x: 168, y: 32, w: 760, h: 1000 }, desk: { x: 32, y: 32 }, zip: { x: 32, y: 164 } },
  compact: { win: { x: 16, y: 80, w: 326, h: 1200 }, desk: { x: 16, y: 16 }, zip: { x: 190, y: 16 } },
}

export type Chapter = 1 | 2

// Where chapter 2 begins: everything chapter 1 did, already done
const CH2_START: Partial<S> = {
  ghost: NO_GHOST, loaded: true, unique: true, transcript: true, langOpen: false,
  lang: 0, hoverLang: undefined, model: 'ready', pct: 100, extracting: false,
  frames: 7, tab: 0, words: 0, include: false, zip: 'idle', downloads: false, scrolled: true,
}

function makeScript(onChapter: (c: Chapter) => void, startAt: { current: Chapter }) {
  return async function script(a: Act<S>) {
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

    // 1. Drag the recording off the desktop into the dropzone
    a.mark('grab')
    const thumb = a.rect('desk-thumb')
    const file = a.rect('desk-file')
    const grab = { x: thumb.x + thumb.width * 0.5, y: thumb.y + thumb.height * 0.55 }
    await a.move(grab)
    await a.wait(220)
    const off = { x: grab.x - file.x, y: grab.y - file.y }
    const drop = a.rect('drop')
    a.mark('drag')
    await a.drag({ x: drop.x + drop.width * 0.45, y: drop.y + drop.height * 0.5 }, (at) => {
      a.put({ ghost: { on: true, dropped: false, off, at } })
    }, { duration: 1300, cursor: 'preserve' })

    // 2. Drop: the workspace opens on the video
    a.mark('drop')
    await a.set((s) => ({ ghost: { ...s.ghost, dropped: true }, loaded: true }))
    await a.wait(900)

    // 3. Keep only unique frames
    a.mark('unique')
    await a.click('unique')
    await a.set({ unique: true })
    await a.wait(450)

    // 4. Audio transcript on; pick its language
    a.mark('transcript')
    await a.click('transcript')
    await a.set({ transcript: true })
    await a.wait(450)
    await a.click('lang')
    await a.set({ langOpen: true })
    await a.wait(380)
    await a.move('lang-0')
    a.put({ hoverLang: 0 })
    await a.wait(260)
    a.mark('pick')
    await a.click('lang-0')
    await a.set({ lang: 0 })
    await a.wait(60)
    await a.set({ langOpen: false, hoverLang: undefined, model: 'download' })

    // 5. The model loads (cached after the first time) and transcribes
    for (const pct of [28, 61, 88, 100]) {
      a.put({ pct })
      await a.wait(300)
    }
    a.put({ model: 'transcribing' })
    await a.wait(300)

    // 6. Extract: the page scrolls to the grid as seven frames arrive
    a.mark('extract')
    await a.click({ at: 'extract', x: 0.88, y: 0.5 })
    await a.set({ extracting: true })
    a.put({ scrolled: true })
    await a.wait(500)
    for (let i = 1; i <= FRAMES.length; i++) {
      a.put({ frames: i })
      await a.wait(230)
    }
    a.put({ extracting: false, model: 'ready' })
    await a.wait(1600)

    onChapter(2)
    }

    // Chapter 2: read the transcript, then export
    a.mark('tab')
    await a.click('tab-transcript')
    await a.set({ tab: 1 })
    await a.wait(250)
    for (let w = 1; w <= TOTAL_WORDS; w++) {
      a.put({ words: w })
      await a.wait(32)
    }
    await a.wait(1500)

    await a.click('tab-frames')
    await a.set({ tab: 0 })
    await a.wait(500)
    a.mark('include')
    await a.click('include')
    await a.set({ include: true })
    await a.wait(420)

    a.mark('download')
    await a.click('zip')
    await a.set({ zip: 'packing' })
    await a.wait(1000)
    await a.set({ zip: 'done', downloads: true })
    a.mark('payoff')
    await a.wait(2400)

    // Reset with a cause: close the popover, back up the page, Clear video
    await a.set({ downloads: false })
    await a.set({ scrolled: false })
    await a.wait(650)
    a.mark('clear')
    await a.click('clear')
    await a.set({ loaded: false, ghost: NO_GHOST })
    await a.move(HOME.wide && a.layout === 'compact' ? HOME.compact : HOME.wide)
    await a.snap({
      unique: false, transcript: false, lang: null, model: 'idle', pct: 0,
      frames: 0, tab: 0, words: 0, include: false, zip: 'idle',
    })
    await a.wait(150)
  }
}

const HOME = { wide: { x: 120, y: 300 }, compact: { x: 300, y: 40 } }

export type HowItWorksProps = {
  theme?: Theme
  onChapter?: (c: Chapter) => void
  /** The chapter the first run starts at. To jump, remount with a new key. */
  startAt?: Chapter
}

export default function HowItWorks({ theme = 'light', onChapter, startAt = 1 }: HowItWorksProps) {
  const chapter = useRef(onChapter)
  chapter.current = onChapter
  const start = useRef<Chapter>(startAt)
  const script = useRef(makeScript((c) => chapter.current?.(c), start)).current

  return (
    <Stage<S>
      width={880}
      height={500}
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
              <Page scrolled={s.scrolled}>
                  <div className="vsd-hero">
                    <span className="vsd-hero__title">Video Slicer</span>
                    <span className="vsd-hero__sub">Extract frames from any video, locally in your browser.</span>
                  </div>
                  <Collapse open={!s.loaded}>
                    <Dropzone />
                  </Collapse>
                  <Collapse open={s.loaded}>
                    <Workspace s={s} layout={layout} />
                  </Collapse>
                  <Collapse open={s.loaded && (s.extracting || s.frames > 0)}>
                    <Results s={s} layout={layout} />
                  </Collapse>
              </Page>
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

/* ---------- The page ------------------------------------------------- */

/** Wide: the app in a quiet browser window. Compact (a phone column): the
 *  page itself on a panel, since a desktop window squeezed to 326px wide
 *  would read as a squashed app. */
function Browser({ layout, style, children }: { layout: Layout; style: React.CSSProperties; children: ReactNode }) {
  if (layout === 'compact') {
    return (
      <div className="ss-window vsd-win vsd-mobile" style={style}>
        <div className="vsd-body">{children}</div>
      </div>
    )
  }
  return (
    <Window className="vsd-win" url="frame-slicer.vercel.app" urlShape="pill" style={style} body={{ className: 'vsd-body' }}>
      {children}
    </Window>
  )
}

/** The app's page. Scrolled, it shifts up so the results sit at the top of
 *  the window; the shift is measured from the results' own position, so the
 *  poster can show it too. */
function Page({ scrolled, children }: { scrolled: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const page = ref.current
    const results = page?.querySelector<HTMLElement>('[data-target="results"]')
    if (!page || !results) return
    let top = 0
    let el: HTMLElement | null = results
    while (el && el !== page) {
      top += el.offsetTop
      el = el.offsetParent as HTMLElement | null
    }
    page.style.setProperty('--vs-shift', `${Math.max(0, top - 12)}px`)
  })
  return (
    <div ref={ref} className="vsd-page" data-scrolled={scrolled || undefined}>
      {children}
    </div>
  )
}

function Dropzone() {
  return (
    <div className="vsd-drop" data-target="drop" data-drop>
      <span className="vsd-drop__icon"><Upload size={22} strokeWidth={1.5} /></span>
      <span className="vsd-drop__title">Drop a video here or click to browse</span>
      <span className="vsd-drop__hint">MP4 · MOV · WEBM · MKV</span>
    </div>
  )
}

function CardHead({ icon, title, meta }: { icon: ReactNode; title: string; meta?: ReactNode }) {
  return (
    <div className="vsd-card__head">
      <span className="vsd-card__title">{icon}{title}</span>
      {meta !== undefined && <span className="vsd-card__meta">{meta}</span>}
    </div>
  )
}

function Checkbox({ on, label, hint, target }: { on: boolean; label: string; hint?: string; target: string }) {
  return (
    <span className="vsd-check" data-target={target} data-cursor="pointer">
      <span className="vsd-check__box" data-on={on || undefined}>
        <Check size={11} strokeWidth={3} />
      </span>
      <span className="vsd-check__label">{label}</span>
      {hint && <span className="vsd-check__hint">{hint}</span>}
    </span>
  )
}

function Workspace({ s, layout }: { s: S; layout: Layout }) {
  return (
    <div className="vsd-work" data-compact={layout === 'compact' || undefined}>
      <div className="vsd-card vsd-source">
        <CardHead icon={<Video size={14} strokeWidth={1.75} />} title="Source" meta="1920×1080 · 30:29" />
        <div className="vsd-source__video">
          <CallPoster className="vsd-art" />
        </div>
        <div className="vsd-source__file">
          <span className="vsd-source__name">{FILE}</span>
          <span className="vsd-card__meta">412 MB</span>
        </div>
      </div>

      <div className="vsd-card vsd-params">
        <CardHead icon={<Sliders size={14} strokeWidth={1.75} />} title="Parameters" meta={<>1 / 60s</>} />
        <div className="vsd-params__body">
          <div className="vsd-seg">
            {['Interval', 'Fixed count', 'Custom', 'Storyboard'].map((m, i) => (
              <span key={m} className="vsd-seg__opt" data-on={i === 0 || undefined}>{m}</span>
            ))}
          </div>
          <div className="vsd-rule" />
          <Checkbox on={s.unique} label="Only unique frames" hint="skips near-identical frames" target="unique" />
          <Checkbox on={s.transcript} label="Audio Transcript" target="transcript" />
          <Collapse open={s.transcript}>
            <div className="vsd-lang-row">
              <span className="vsd-select" data-target="lang" data-cursor="pointer" data-open={s.langOpen || undefined}>
                <States value={s.lang === null ? 'none' : 'chosen'} align="start" className="vsd-select__text" states={{ none: <span>Select language</span>, chosen: <span data-chosen>{LANGS[s.lang ?? 0]}</span> }} />
                <ChevronDown size={14} strokeWidth={1.75} />
              </span>
              <States
                value={s.model}
                align="start"
                className="vsd-model"
                states={{
                  idle: <span />,
                  download: (
                    <span className="vsd-model__line">
                      <Meter value={s.pct / 100} className="vsd-model__meter" />
                      <span className="vsd-model__pct"><Count value={s.pct} duration={280} format={(n) => String(Math.round(n)).padStart(3, '\u2007')} />%</span>
                    </span>
                  ),
                  transcribing: <span className="vsd-model__line"><Spinner size={12} /> Transcribing…</span>,
                  ready: <span className="vsd-model__line vsd-model__ready"><Check size={12} strokeWidth={2.5} /> Transcript ready</span>,
                }}
              />
            </div>
          </Collapse>
          <Popover show={s.langOpen} origin="bottom left" className="vsd-lang-menu">
            <Menu items={LANGS} value={s.hoverLang} targets={LANGS.map((_, i) => `lang-${i}`)} />
          </Popover>
        </div>
        <div className="vsd-params__foot">
          <Button className="vsd-btn" data-target="clear" data-cursor="pointer">Clear video</Button>
          <Button className="vsd-btn vsd-btn--extract" variant="primary" data-target="extract" data-cursor="pointer">
            <States value={s.extracting ? 'go' : s.unique ? 'unique' : 'all'} states={{ all: <span>Extract frames (~30)</span>, unique: <span>Extract frames (~7)</span>, go: <span>Extracting {s.frames}/7</span> }} />
          </Button>
        </div>
      </div>
    </div>
  )
}

function Results({ s, layout }: { s: S; layout: Layout }) {
  const ready = s.model === 'ready' || s.model === 'transcribing'
  return (
    <div className="vsd-results" data-target="results" data-compact={layout === 'compact' || undefined}>
      <div className="vsd-results__bar">
        <Tabs
          className="vsd-tabs"
          value={s.tab}
          targets={['tab-frames', 'tab-transcript']}
          items={[
            <span key="f" className="vsd-tab"><FileImage size={14} strokeWidth={1.75} />Frames<span className="vsd-tab__count"><Count value={s.frames} duration={240} /></span></span>,
            <span key="t" className="vsd-tab"><Mic size={14} strokeWidth={1.75} />Transcription</span>,
          ]}
        />
        {layout === 'wide' && <Actions s={s} />}
      </div>
      {layout === 'compact' && <Actions s={s} />}
      <div className="vsd-panels">

        <div className="vsd-grid" data-show={s.tab === 0 || undefined}>
          {FRAMES.map(({ Art, time }, i) => (
            <div key={time} className="vsd-shot" data-on={i < s.frames || undefined}>
              <div className="vsd-shot__img"><Art className="vsd-art" /></div>
              <div className="vsd-shot__meta">
                <span className="vsd-shot__chip">#{String(i + 1).padStart(3, '0')}</span>
                <span className="vsd-shot__time">{time}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="vsd-transcript" data-show={s.tab === 1 || undefined} data-ready={ready || undefined}>
          {LINES.map((l, i) => {
            const before = WORDS.slice(0, i).reduce((a, b) => a + b, 0)
            const count = Math.max(0, Math.min(WORDS[i], s.words - before))
            return (
              <div key={l.t} className="vsd-line" data-on={count > 0 || undefined}>
                <span className="vsd-line__time">{l.t}</span>
                <Stream className="vsd-line__text" text={l.text} count={count} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Actions({ s }: { s: S }) {
  return (
    <span className="vsd-results__actions" data-show={s.tab === 0 || undefined}>
          <Checkbox on={s.include} label="Include transcript" target="include" />
          <Button className="vsd-btn vsd-btn--zip" variant="primary" data-target="zip" data-cursor="pointer" icon={<States value={s.zip} className="vsd-zip-icon" states={{ idle: <Download size={14} strokeWidth={1.75} />, packing: <Spinner size={12} />, done: <Check size={14} strokeWidth={2.25} /> }} />}>
            <States value={s.zip} states={{ idle: <span>Download ZIP</span>, packing: <span>Packing…</span>, done: <span>Downloaded</span> }} />
          </Button>
    </span>
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
      const box = root.getBoundingClientRect()
      const scale = box.width / root.offsetWidth || 1
      const hit = document.elementFromPoint(box.left + x * scale, box.top + y * scale)?.closest<HTMLElement>('[data-drop]') ?? null
      if (hit && root.contains(hit)) next = hit
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

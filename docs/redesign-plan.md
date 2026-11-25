# Video Slicer redesign: implementation plan

Branch `redesign/b2c` (worktree `Video-Slicer_redesign`). Nothing gets merged into `main` until Jorge has reviewed the preview.

Source of truth: Figma file `h0aoaJ6qfjJDAweYhTSAzL`, section "Components and Screens" (node 1:3). It holds 17 screens. Those screens bind to three variable collections, which are mirrored in code: "Video Slicer" (color, with Dark and Light modes), "Typography" and "Spacing".

Motion rules come from `-job-finder/skills/motion.md`. Every animation below states its purpose, its frequency and the token it uses.

---

## 1. Design system in code

All design system code lives in `src/styles/`. Components never contain literal colors, sizes, durations or easing curves.

| File | What it contains |
| --- | --- |
| `tokens.css` | Primitive and semantic tokens, mirrored 1:1 from the Figma variables. |
| `type.css` | One class per Figma text style (`.t-display-xl`, `.t-title-m`, `.t-body-l`, `.t-mono-m`, and so on). |
| `motion.css` | Motion tokens, reusable keyframes and the reduced-motion policy. |
| `components.css` | Primitives: button, icon button, segmented control, toggle, radio card, field, alert, progress, tile, tabs. |
| `screens.css` | Layout for each stage: home, slice, processing, result, error. |

### Tokens

**Colour.** Each token keeps the same name as its Figma variable, prefixed with `--c-`.
- The prefix applies to every colour token, for example `--c-bg`, `--c-surface`, `--c-surface-raised`, `--c-brand`, `--c-text-primary`, `--c-text-subtle`, `--c-link`, `--c-danger`, `--c-scrim-strong` and `--c-paper`.
- Each token has both a light and a dark value, switched by `[framestack-theme]`. That is the same attribute the portfolio's ThemeToggle uses.
- The existing names from the current `tokens.css` (`--brand`, `--app-bg`, and so on) stay as aliases. They are only used by the How it works demo kit, which is out of scope.

**Typography.** Families are `--font-serif` (Macklin Text), `--font-sans` (Macklin Sans) and `--font-mono` (Fragment Mono). Each Figma style gets its own size, line-height and tracking tokens:

| Style | Size / line height |
| --- | --- |
| display-xl | 72/71 |
| display-l | 64/65 |
| title-m | 32/38 |
| title-s | 22/29 |
| transcript | 18/29 |
| body-l | 18/27 |
| body-m | 15/22 |
| label-l | 15/18 |
| label-m | 14/17 |
| label-s | 12/14 |
| caption | 13/18 |
| mono-l | 16/21 |
| mono-m | 14/18 |
| mono-s | 12/16 |

**Spacing.** `--space-2xs` through `--space-5xl` are 4, 8, 12, 16, 24, 32, 40, 48, 64 and 80 px. Radii are `--radius-xs` through `--radius-full`: 4, 8, 12, 16, 24 and 999 px.

**Motion.**
- Easing: `--ease-out`, `--ease-in-out`, `--ease-drawer` and `--ease-exit`.
- Durations: `--dur-press` 120, `--dur-tooltip` 160, `--dur-dropdown` 200, `--dur-modal` 300, `--dur-entrance` 640 and `--dur-logo-build` 1400 (all in ms).
- Stagger: `--stagger` 50 ms.

**Elevation.** `--shadow-card`, `--shadow-float` (the bulk bar and the modal) and `--focus-ring`.

### Icons
`@carbon/icons-react` replaces `lucide-react` in every app component. This matches the Carbon decision made in Figma. The demo kit keeps its own icons.

---

## 2. Brand: Jorge Logo

The header uses Jorge Logo, ported from the Framer component (`Jorge_Logo2.tsx` together with AskJorgeAI's `AvatarMark`). It is the same 64 petals in the same five colour groups, with the colours kept fixed in both themes, as in the portfolio. It lives in `src/brand/JorgeLogo.tsx` and has two behaviours:

1. **Entrance build (once per session).** Each petal fades from 0.12 to 1 opacity. The ramp is 18% of the build time, and the stagger is derived so the last petal finishes at `--dur-logo-build`. This is the exact algorithm from Framer.
2. **Busy loop (header loader).** While the app is working, the mark cycles through the portfolio's "thinking" phases:
   - sequential, hold-all, collapse, half-build-retreat and core-out;
   - each run starts on a different phase.

   It runs while a URL downloads, while the converter loads, during extraction and during transcription. When the work ends, the mark settles back to fully built.
   - Under reduced motion it stays fully built. A text status (`aria-live`) carries the information instead.
   - The SVG is `aria-hidden`. The busy state is announced by the status text on the page.

---

## 3. Screens and states

App flow (`stage` is derived from state, so it never drifts):

```
home ──file/url──▶ slice ──extract──▶ processing ──done──▶ result
  ▲                  │  ▲                │ cancel              │
  └──── start over ──┴──┴────────────────┘◀────────────────────┘
error (E1) replaces slice when the native player and the converter both fail
```

| Figma | Stage | What gets built |
| --- | --- | --- |
| S1 1:566 | home | Hero (Display XL "Drop a video. Keep every frame."). Primary "Choose a video", secondary "Paste a link", tertiary "How it works" link. Formats line. "Also transcribe the audio" toggle with language. A stack of three stills on the right. The whole page is the drop target. |
| S1b / S1c | home | The link field opens inline: label, hint, field with link icon, then Load. While downloading, the button shows a spinner and a percentage. Errors appear under the field with an icon and danger colour (403, server status, not a video, CORS). |
| S1d | home | Drag-over: the dashed border turns brand-coloured, the page dims slightly, and "Drop the video here" is centred. |
| S1e | modal | How it works: the existing demo inside the new modal shell, with chapters 1 and 2 as pills and a progress rail. The demo URL now shows `videoslicer.jorgeverlindo.design`. |
| S2 / S2b / S2c / S3 | slice | Left: file row (filename + Replace video), custom player and filmstrip scrubber. Right: "How should we slice it?" panel. |
| S2d | slice | Portuguese picked: one line of caption hint about the 460 MB download. |
| S4 | processing | The panel shows "Slicing your video" and the count-up percentage. Then "Frame n of N, about x seconds left", a progress bar, the arriving thumbnails and a transcription card. Cancel stops the extraction. |
| S4b | slice | Converter mode: the player is replaced by the "Getting this video ready" state. Custom is disabled with a reason, and the CTA waits. |
| E1 | error | "We can't process this video": raw error in mono, then QuickTime steps and the ffmpeg command with Copy. Primary action: "Try another file". |
| S5 | result | Title "N frames" with a one-sentence summary. Start over plus Download all frames. Tabs. A 4-column tile grid; clicking a tile toggles its selection and each tile also has a download button. The floating selection bar shows "n selected", Include transcript, Clear and Download n. |
| S6 / S6b | result | The Transcript tab has a player on the left and the transcript on the right. The active line follows playback; clicking a line seeks to it. Copy and Download .md are offered, plus "Follow playback" for long transcripts. |
| S6c | result | Transcript error card with "Try again". The frames stay available. |
| S7 | result | Storyboard: ratio segmented control, footnote field, Export PDF and a paper preview. |
| Light | all | Every stage, driven by the same tokens. |

**Behaviour the app gains to match the screens** (approved in review):
- Cancel during extraction. An abort flag stops the frame generator.
- Multi-select with a bulk download bar.
- Follow playback on the transcript.

**Copy that does not change:** the error messages from the app, the 460 MB note and the 30 MB converter note.

**Small fixes:**
- The demo shows the Jorge domain instead of the old one.
- An invalid file now shows an error instead of being ignored.
- A failed PDF export shows an alert.

---

## 4. Motion plan

| # | Moment | Purpose | Frequency | Spec |
| --- | --- | --- | --- | --- |
| M1 | **Home entrance** | Continuity: the page assembles in reading order | Once per session | The logo builds over 1400 ms. In parallel, a sequence that starts at 120 ms:<br>• the brand name, steps and pill fade in<br>• the headline lines rise 12 px and lose a 6 px blur over 640 ms with `--ease-out`, 50 ms apart<br>• then the body, actions, formats and transcript row<br>• the three stills slide in from 24 px, rotating into their final angle, 80 ms apart, then settle<br>Total time is under 1.2 s, apart from the logo. Hover and click work at once (no input blocking). Reduced motion: opacity only, 200 ms. |
| M2 | **Header loader** | State indication: the app is busy | Per task | The Jorge Logo phases described above. The loop runs on rAF, and rAF pauses in hidden tabs. |
| M3 | **Inline loading** | Feedback | Per task | A 16 px spinner made from `--c-brand` and the border, `linear` 800 ms loop. Bars use a `transform: scaleX` fill with `--ease-out` 200 ms, so there are no width transitions. |
| M4 | **Percent count** | State indication: progress feels continuous | Per extraction | The shown value tweens to the target over 400 ms with `--ease-out`, in tabular figures. When the target jumps, the tween retargets from the current value (interruptible). Reduced motion: the value is set directly. |
| M5 | **Arriving thumbnails** | Spatial: frames land in the strip | Per frame | The newest slot fades from 0 and scales from 0.96 to 1 over 200 ms. Older slots don't animate. Empty slots are dashed. |
| M6 | **Result tiles** | Explanation: the set is complete | Per result | The first 12 tiles stagger by 30 ms (opacity, plus translateY 8 px to 0 over 300 ms). Any tiles after that appear with the container, so there is no long tail. |
| M7 | **Preset cards / segmented / toggle** | Feedback | Tens per session | Colour and border over `--dur-press` with `ease`. The radio dot scales from 0.6 to 1 over 160 ms with `--ease-out`. The toggle knob uses transform only. |
| M8 | **Stage change** (home → slice → result) | Continuity | A few per session | The outgoing stage is not animated. The incoming stage fades in and rises 8 px over 300 ms with `--ease-out`. |
| M9 | **Modal** (How it works) | Spatial | Occasional | The backdrop fades over 300 ms. The panel goes from opacity 0 and scale 0.97 to 1 over 300 ms with `--ease-out`. On exit it fades for 200 ms (exits run faster). |
| M10 | **Selection bar** | Spatial: it comes from below | Per selection | translateY 16 px to 0 plus opacity over 200 ms with `--ease-out`. On exit it reverses for 160 ms. |
| M11 | **Drag-over** | Feedback | Per drag | Border and scrim fade over 160 ms. The response starts within 100 ms. |

Rules applied everywhere:
- Only `transform` and `opacity` are animated.
- Exits are faster than entrances.
- Nothing bounces on form controls.
- `prefers-reduced-motion` keeps opacity and drops movement.
- Every duration and curve comes from a token.

---

## 5. Accessibility and quality bar
- Contrast is at least 4.5:1 for text, which is why `text-subtle` and `link` exist.
- Targets are at least 40 px.
- Focus rings come from `--focus-ring`.
- Status text uses `aria-live`.
- The radio cards are real radio inputs.
- The custom player is keyboard operable: Space plays or pauses, ←/→ seek and ⌥D marks a frame.
- At most one primary button per view.
- Mono type is used only for numbers and timecodes.
- Below 960 px the layout stacks into one column.

## 6. Execution order
1. Tokens, type, motion and primitives (this commit series).
2. Jorge Logo and the topbar.
3. The home stage, with the paste link, drag-over and How it works shell.
4. The slice stage: player, filmstrip, panel, modes and converter.
5. The processing stage and Cancel.
6. The result stage: Frames with selection, Transcript, Storyboard.
7. Errors (E1 and S6c).
8. Verify light and dark at 1440 and 390 px with real video and transcription. Then run the build.

## 7. Preview
Run `npm run dev` in the worktree; it serves on port 5176. It is local only. A Vercel preview deploy happens only on request.

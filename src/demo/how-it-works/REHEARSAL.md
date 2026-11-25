# How it works — rehearsal notes

Built with the Stageshow skill. Rebuilt on the redesigned interface (Home,
Slice, Result); the script and the keyframe illustrations are unchanged.

- **Gold copied:** `examples/upload` (desktop file dragged into a window, drag
  image), with `loading` (tiles resolving) and `ai-chat` (Stream for the
  transcript).
- **Fidelity:** the page inside the window is built from the app's own
  components and classes (topbar, steps, `btn`, `toggle`, `radio-card`, `seg`,
  `stepper`, `select`/`menu`, `tx-reveal`, processing panel, `tabs`, `tiles`,
  `tx`), drawn at the app's own size and zoomed into the window
  (0.62 wide, 0.66 compact). Only the screen grids are copied into `demo.css`
  (`.vsd-home`, `.vsd-slice`), without the app's viewport media queries, since
  the page is not the viewport. When the app's components change, the demo
  follows them.
- **Story:** one loop, two chapters. 1: drop `user-test.mp4` on the home → Slice;
  Only unique frames, Transcribe audio (options open, the page scrolls to
  them), confirm English, Start transcription (model download, Transcribing…),
  Extract unique frames → processing panel (scanned 30, kept 7) → Result deals
  seven tiles. 2: Transcript tab streams five lines (page scrolls to show them),
  back to Frames, Include transcript in ZIP, Download all frames → Packing… →
  `user-test_frames.zip` lands on the desktop. Start over is the visible reset.
- **Framing:** the window sits inside the stage with a 32px gutter on top and
  right and runs off the bottom, so nothing the cursor touches is cut.
- **Checked in the app:** light and dark, wide (dialog at 1280×800) and compact
  (375×812), both chapter jumps, the full loop and its reset.
- **Not checked:** `film.mjs --gate` (the playground copy doesn't load the
  app's CSS, so it can't render this version); Safari/Firefox (`zoom` needs
  Firefox 126+); very slow devices. `public/how-it-works.mp4` (the 4:3 export
  for the portfolio) still shows the old interface until it is re-rendered.

# How it works — rehearsal notes

Built with the Stageshow skill (benjitaylor/skills). Source of truth for
filming lives in `../../../../.stageshow-dev/examples/video-slicer/` (the
playground copy); this folder is the shipped copy with its import paths fixed.

- **Gold copied:** `examples/upload` (desktop file dragged into a window, drag
  image), with `loading` (skeleton tiles resolving) and `ai-chat` (Stream for
  the transcript).
- **Story:** one loop, two chapters. 1: drop `user-test.mp4`, Only unique frames,
  Audio Transcript → English, model loads, Extract → 7 frames. 2: Transcription
  tab streams, Include transcript, Download ZIP → `frames.zip` lands on the
  desktop. Clear video is the visible reset. `onChapter` drives the dialog's stepper.
- **Content:** the 7 frames are illustrations of moments in a usability-test
  recording (people talking, an asset library, a bulk-edit dialog, the edit
  panel, an asset, tags). Drawn only in tokens.css colors. No real faces,
  names, brands or client assets; the transcript lines are written for the demo.
- **Look:** kit tokens point at the app's CSS variables, so light/dark follow
  the app toggle. Compact (< 600px container) drops the browser chrome and shows
  the page on a panel.
- **Gate (`film.mjs --gate`):** passes except three lines accepted on purpose:
  - `framing: corner bleed … 32px above but 168px left` (wide) and the compact
    gutter line: the desktop strip that holds the file. The gold `upload`
    example raises the same line.
  - `uneven padding: div.vsd-drop`: the real app's centered dropzone, kept for fidelity.
- **Not checked:** Safari/Firefox, keyboard-only flow in the dialog beyond Esc
  and the close button, very slow devices.

# Fonts

## Macklin Text / Macklin Sans
Not stored here. `src/styles/index.css` loads the same static woff2 files the
portfolio (jorgeverlindo.design) publishes on the Framer CDN, so every deploy
— including the ones Vercel builds from GitHub — gets the real typeface.
The licensed source files stay out of the repo (see `.gitignore`).

If a font is ever replaced in the Framer project, its CDN URL changes: copy
the new `framerusercontent.com/assets/…woff2` URLs from the portfolio's
`@font-face` rules into `src/styles/index.css` and `public/og.html`.

## Fragment Mono
`FragmentMono-Regular.woff2` — latin subset, self-hosted. Copyright 2022 The
Fragment Mono Project Authors, licensed under the SIL Open Font License 1.1:
https://openfontlicense.org

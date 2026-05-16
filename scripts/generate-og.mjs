/**
 * Generates public/og.png — the Open Graph sharing banner for Video Slicer.
 * Run: node scripts/generate-og.mjs
 */

import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// ── Embed logo as data URI ─────────────────────────────────────────────────
const logoSvg = readFileSync(join(root, 'public/logo.svg'))
const logoDataUri = `data:image/svg+xml;base64,${logoSvg.toString('base64')}`

// ── Colours (VRLND tokens) ─────────────────────────────────────────────────
const BG       = '#F7F0EB'   // --app-bg light
const CARD     = '#F5F2ED'   // --white light
const BRAND    = '#46433E'   // --brand light
const MUTED    = 'rgba(70,67,62,0.50)'
const BORDER   = 'rgba(0,0,0,0.09)'

// ── SVG canvas 1200×630 ────────────────────────────────────────────────────
const W = 1200
const H = 630

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <!-- Subtle grid lines -->
  <line x1="0" y1="${H * 0.5}" x2="${W}" y2="${H * 0.5}" stroke="${BORDER}" stroke-width="1"/>
  <line x1="${W * 0.5}" y1="0" x2="${W * 0.5}" y2="${H}" stroke="${BORDER}" stroke-width="1"/>

  <!-- Card panel -->
  <rect x="72" y="72" width="${W - 144}" height="${H - 144}"
        rx="16" fill="${CARD}" stroke="${BORDER}" stroke-width="1"
        filter="url(#shadow)"/>

  <defs>
    <filter id="shadow" x="-4%" y="-4%" width="108%" height="108%">
      <feDropShadow dx="0" dy="4" stdDeviation="16" flood-color="${BRAND}" flood-opacity="0.08"/>
    </filter>
  </defs>

  <!-- Logo mark — top-left inside card -->
  <image href="${logoDataUri}" x="112" y="112" width="64" height="64"/>

  <!-- Brand name -->
  <text x="188" y="153"
        font-family="Georgia, 'Times New Roman', serif"
        font-size="18" font-weight="400" letter-spacing="2"
        fill="${BRAND}" text-anchor="start">JORGE VERLINDO</text>

  <!-- Divider -->
  <line x1="112" y1="215" x2="${W - 112}" y2="215" stroke="${BORDER}" stroke-width="1"/>

  <!-- Main headline -->
  <text x="112" y="318"
        font-family="Georgia, 'Times New Roman', serif"
        font-size="88" font-weight="400" letter-spacing="-3"
        fill="${BRAND}" text-anchor="start">Video Slicer</text>

  <!-- Tagline -->
  <text x="114" y="378"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-size="24" font-weight="300" letter-spacing="0.2"
        fill="${MUTED}" text-anchor="start">
    Extract frames from any video — locally in your browser.
  </text>
  <text x="114" y="410"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-size="24" font-weight="300" letter-spacing="0.2"
        fill="${MUTED}" text-anchor="start">
    No upload, no server. The file never leaves your machine.
  </text>

  <!-- Bottom divider -->
  <line x1="112" y1="465" x2="${W - 112}" y2="465" stroke="${BORDER}" stroke-width="1"/>

  <!-- Feature pills -->
  ${['Frame Extraction', 'FFmpeg WASM', 'AI Transcription', 'Works offline'].map((label, i) => {
    const x = 112 + i * 215
    return `
    <rect x="${x}" y="487" width="192" height="36" rx="18"
          fill="rgba(70,67,62,0.07)" stroke="${BORDER}" stroke-width="1"/>
    <text x="${x + 96}" y="506"
          font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          font-size="13" font-weight="400" letter-spacing="1"
          fill="${BRAND}" text-anchor="middle" dominant-baseline="middle">${label}</text>`
  }).join('')}

  <!-- URL — bottom right, below pills -->
  <text x="${W - 112}" y="548"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-size="14" font-weight="400" letter-spacing="0.3"
        fill="${MUTED}" text-anchor="end">videoslicer.jorgeverlindo.design</text>

</svg>
`

// ── Write PNG ──────────────────────────────────────────────────────────────
mkdirSync(join(root, 'public'), { recursive: true })
const outPath = join(root, 'public/og.png')

await sharp(Buffer.from(svg))
  .png({ quality: 95 })
  .toFile(outPath)

console.log(`✓  OG image written → public/og.png  (${W}×${H})`)

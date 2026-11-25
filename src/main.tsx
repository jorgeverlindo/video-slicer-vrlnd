import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App'

// Home entrance (M1), once per session. Elements with .enter wait hidden on
// their first keyframe until the display and text faces are in, so nothing
// swaps fonts mid-fade; an 800ms cap keeps a slow CDN from holding the page.
// Timers only (no rAF): rAF never fires in a background tab, which would
// leave the page hidden. Input is never blocked while the sequence plays.
const root = document.documentElement
let seen = false
try { seen = sessionStorage.getItem('vs-intro') === '1' } catch { /* private mode */ }

if (!seen) {
  root.classList.add('intro')
  const fontsIn = Promise.all([
    document.fonts.load('400 1em "Macklin Text"'),
    document.fonts.load('300 1em "Macklin Sans"'),
  ]).catch(() => {})
  const cap = new Promise((resolve) => setTimeout(resolve, 800))
  Promise.race([fontsIn, cap]).then(() => {
    root.classList.add('intro-run')
    try { sessionStorage.setItem('vs-intro', '1') } catch { /* ignore */ }
    setTimeout(() => root.classList.remove('intro', 'intro-run'), 2000)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

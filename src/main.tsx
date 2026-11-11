import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App'

// Entrance animation: first load only (see "Entrance" in index.css).
// Elements wait hidden on their first keyframe until the two faces the home
// renders are in, so no text swaps fonts mid-fade. The cap keeps a slow font
// CDN from holding the page back. Timers only, no requestAnimationFrame:
// rAF never fires while a tab isn't rendering (opened in the background),
// which would leave the page hidden on its first keyframe.
const root = document.documentElement
root.classList.add('intro')
const fontsIn = Promise.all([
  document.fonts.load('400 1em "Macklin Text"'),
  document.fonts.load('400 1em "Macklin Sans"'),
]).catch(() => {})
const cap = new Promise((resolve) => setTimeout(resolve, 800))
Promise.race([fontsIn, cap]).then(() => {
  root.classList.add('intro-run')
  setTimeout(() => root.classList.remove('intro', 'intro-run'), 2200)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App'

// Entrance animation: first load only (see "Entrance" in index.css)
document.documentElement.classList.add('intro')
setTimeout(() => document.documentElement.classList.remove('intro'), 2200)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

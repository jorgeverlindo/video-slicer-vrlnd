import ThemeToggle from './ThemeToggle'

type NavbarProps = {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export default function Navbar({ theme, onToggleTheme }: NavbarProps) {
  return (
    <nav className="navbar">
      {/* Brand — logo mark + name, links to portfolio */}
      <a
        href="https://jorgeverlindo.design"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          textDecoration: 'none',
        }}
      >
        <img
          src="/logo.svg"
          alt="Jorge Verlindo"
          width={32}
          height={32}
          className="jv-logo"
          style={{ display: 'block', flexShrink: 0 }}
        />
        <span className="navbar-name" style={{
          fontFamily: "'Macklin Text', 'Playfair Display', serif",
          fontSize: 20,
          fontWeight: 400,
          letterSpacing: '0px',
          color: 'var(--brand)',
          lineHeight: 1.2,
        }}>
          JORGE VERLINDO
        </span>
      </a>

      {/* Theme toggle — far right */}
      <div className="navbar-actions">
        <ThemeToggle theme={theme} toggle={onToggleTheme} />
      </div>
    </nav>
  )
}

export function Logo({ small = false }) {
  return (
    <div className={small ? 'logo logo-small' : 'logo'} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2.5 4 5.5v6c0 4.8 3.4 8.9 8 10 4.6-1.1 8-5.2 8-10v-6l-8-3Z" />
        <path d="M7.5 12s1.7-3 4.5-3 4.5 3 4.5 3-1.7 3-4.5 3-4.5-3-4.5-3Z" />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      </svg>
    </div>
  )
}

// Shown at the top of every inner page: this is a prototype, not an emergency service.
export function PrototypeNotice() {
  return (
    <div className="notice" role="note">
      <strong>Prototype for a student contest.</strong> WatchDog does not replace calling{' '}
      <strong>911</strong> or <strong>Campus Police</strong>.
    </div>
  )
}

export function Shell({ children }) {
  return (
    <div className="shell">
      <PrototypeNotice />
      <header className="topbar">
        <a className="brand" href="#/">
          <Logo small />
          <span>WatchDog</span>
        </a>
        <nav className="nav">
          <a href="#/about">About</a>
          <a href="#/demo">Demo</a>
        </nav>
      </header>
      <main className="content">{children}</main>
      <footer className="footer">
        Nate Ramos · CUA Busch School AI Vibe Coding Contest, Fall 2026 ·{' '}
        <a href="https://github.com/nateramos/WatchDog">GitHub</a>
      </footer>
    </div>
  )
}

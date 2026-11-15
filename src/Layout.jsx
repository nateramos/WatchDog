import { LogoMark } from './LogoMark.jsx'
import { signOut } from './auth.js'
import { useStore } from './store.jsx'

// Shown at the top of every inner page: this is a prototype, not an emergency service.
export function PrototypeNotice() {
  return (
    <div className="notice" role="note">
      <span>
        <strong>Prototype MVP</strong> · Busch School of Business Vibe Code Contest · Fall 2026
      </span>
      <span className="notice-sep" aria-hidden="true" />
      <span>
        WatchDog does not replace calling 911.
      </span>
    </div>
  )
}

export function SignOutButton() {
  return (
    <button className="link-button" onClick={() => signOut()}>
      Sign out
    </button>
  )
}

export function Shell({ children }) {
  const store = useStore()
  const pending = store ? store.alerts.filter((a) => a.decision === 'pending').length : 0
  return (
    <div className="shell">
      <PrototypeNotice />
      <header className="topbar">
        <a className="brand" href="#/">
          <LogoMark size={30} />
          <span>WatchDog</span>
        </a>
        <nav className="nav">
          <a href="#/cameras">Cameras</a>
          <a href="#/alerts">
            Alerts
            {pending > 0 && <span className="count" aria-label={`${pending} need review`}>{pending}</span>}
          </a>
          <a href="#/demo">Demo</a>
          <a href="#/about">About</a>
          <SignOutButton />
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

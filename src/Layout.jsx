import { useEffect, useState } from 'react'
import { LogoMark } from './LogoMark.jsx'
import { signOut } from './auth.js'
import { loadModel } from './detector.js'
import { useStore } from './store.jsx'
import './console.css'

// The app's frame, laid out like a security control room: a status bar across the top, page
// links down the left side (a tab bar along the bottom on phones), and the page itself.

// Shown at the top of every inner page: this is a prototype, not an emergency service.
export function PrototypeNotice() {
  return (
    <div className="notice" role="note">
      <span>
        <strong>Prototype MVP</strong> · Busch School of Business Vibe Code Contest · Fall 2026
      </span>
      <span className="notice-sep" aria-hidden="true" />
      <span>WatchDog does not replace calling 911.</span>
    </div>
  )
}

export function SignOutButton() {
  return (
    <button className="con-icon-button" onClick={() => signOut()} title="Sign out" aria-label="Sign out">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M16 16l4-4-4-4M20 12H10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

// A clock that ticks every second, like the one on a real security console.
export function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}

// Whether Model Dublin has finished loading in this browser (it starts loading at sign-in).
function useModelStatus() {
  const [status, setStatus] = useState('loading')
  useEffect(() => {
    let alive = true
    loadModel()
      .then(() => alive && setStatus('ready'))
      .catch(() => alive && setStatus('error'))
    return () => {
      alive = false
    }
  }, [])
  return status
}

const MODEL_TEXT = { loading: 'Loading', ready: 'Ready', error: 'Unavailable' }

function NavIcon({ kind }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      {kind === 'cameras' && (
        <g {...p}>
          <rect x="3" y="4" width="8" height="7" rx="1.5" />
          <rect x="13" y="4" width="8" height="7" rx="1.5" />
          <rect x="3" y="13" width="8" height="7" rx="1.5" />
          <rect x="13" y="13" width="8" height="7" rx="1.5" />
        </g>
      )}
      {kind === 'alerts' && (
        <g {...p}>
          <path d="M12 3 2.5 19.5h19L12 3Z" />
          <path d="M12 10v4M12 17h.01" />
        </g>
      )}
      {kind === 'demo' && (
        <g {...p}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m10 9 5 3-5 3V9Z" />
        </g>
      )}
    </svg>
  )
}

const PAGES = [
  ['#/demo', 'demo', 'Demo'],
  ['#/cameras', 'cameras', 'Cameras'],
  ['#/alerts', 'alerts', 'Alerts'],
]

export function Shell({ children }) {
  const store = useStore()
  const now = useNow()
  const model = useModelStatus()
  const pending = store ? store.alerts.filter((a) => a.decision === 'pending').length : 0
  const reviewer = store?.reviewer.trim()
  const here = window.location.hash || '#/demo'
  return (
    <div className="console">
      <PrototypeNotice />
      <header className="con-bar">
        <a className="con-brand" href="#/" title="WatchDog home">
          <LogoMark size={30} />
          <span className="con-brand-name">WatchDog</span>
        </a>
        <span className="con-site">Sample School · Main Campus</span>
        <div className="con-status" role="status">
          <span className={`con-chip con-chip-${model}`} title="The gun-detection model, loaded in this browser">
            <i />
            Model Dublin · {MODEL_TEXT[model]}
          </span>
          {pending > 0 ? (
            <a className="con-chip con-chip-alert" href="#/alerts">
              <i />
              {pending} awaiting review
            </a>
          ) : (
            <span className="con-chip con-chip-clear">
              <i />
              No alerts waiting
            </span>
          )}
        </div>
        <div className="con-right">
          <span className="con-duty" title="Reviewer on duty: set on the Alerts page">
            On duty: <b>{reviewer || '—'}</b>
          </span>
          <time className="con-clock" dateTime={now.toISOString()}>
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </time>
          <SignOutButton />
        </div>
      </header>
      <div className="con-body">
        <nav className="con-side" aria-label="Pages">
          {PAGES.map(([href, kind, label]) => (
            <a key={href} href={href} className={here === href ? 'is-here' : ''} aria-current={here === href ? 'page' : undefined}>
              <NavIcon kind={kind} />
              <span>{label}</span>
              {kind === 'alerts' && pending > 0 && (
                <b className="con-badge" aria-label={`${pending} need review`}>
                  {pending}
                </b>
              )}
            </a>
          ))}
        </nav>
        <main className="con-main">{children}</main>
      </div>
    </div>
  )
}

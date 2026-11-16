import { useEffect, useRef, useState } from 'react'
import { Shell } from './Layout.jsx'
import FlagCard from './FlagCard.jsx'
import Guide from './Guide.jsx'
import ReviewLog from './ReviewLog.jsx'
import { cameraLabel } from './Cameras.jsx'
import { useStore } from './store.jsx'

const STATUS = { pending: 'Needs review', confirmed: 'Threat confirmed', dismissed: 'False alarm' }

// The Alerts page as an incident queue, like a dispatch console: alerts down the left (newest
// first), the selected one large on the right with its clip and the Confirm / Dismiss
// decision. Keyboard: C confirm, D dismiss, arrow keys move through the queue. On a phone the
// list comes first and an alert opens on its own screen.
export default function Alerts() {
  const { alerts, log, reviewer, setReviewer, decide, clearLog } = useStore()
  const [tab, setTab] = useState('queue') // queue | log
  const [show, setShow] = useState('pending') // pending | all
  const pending = alerts.filter((a) => a.decision === 'pending')
  const shown = show === 'pending' ? pending : alerts
  const [selectedId, setSelectedId] = useState(null)
  const [openOnPhone, setOpenOnPhone] = useState(false)
  const selected = shown.find((a) => a.id === selectedId) ?? shown[0] ?? null
  const hasReviewer = reviewer.trim().length > 0
  const [needName, setNeedName] = useState(false)
  const nameRef = useRef(null)

  // Every decision is signed: without a name, send the reviewer to the name box first.
  function onDecide(alert, decision) {
    if (!alert || alert.decision !== 'pending') return
    if (!hasReviewer) {
      setNeedName(true)
      nameRef.current?.focus()
      return
    }
    // After a decision in "Needs review", move on to the next alert in the queue.
    const i = shown.findIndex((a) => a.id === alert.id)
    const next = shown[i + 1] ?? shown[i - 1]
    decide(alert.id, decision)
    if (show === 'pending') setSelectedId(next ? next.id : null)
  }

  function move(by) {
    if (!shown.length) return
    const i = Math.max(0, shown.findIndex((a) => a.id === selected?.id))
    const next = shown[Math.min(shown.length - 1, Math.max(0, i + by))]
    setSelectedId(next.id)
  }

  // Keyboard shortcuts, unless the reviewer is typing in a box.
  const keys = useRef(null)
  keys.current = { selected, onDecide, move, tab }
  useEffect(() => {
    const onKey = (e) => {
      const { selected: sel, onDecide: act, move: go, tab: t } = keys.current
      if (t !== 'queue' || e.metaKey || e.ctrlKey || e.altKey) return
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      const k = e.key.toLowerCase()
      // preventDefault: a shortcut key must not also be typed into the name box it may focus
      if (k === 'c' || k === 'd') {
        e.preventDefault()
        act(sel, k === 'c' ? 'confirmed' : 'dismissed')
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        go(e.key === 'ArrowDown' ? 1 : -1)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <Shell>
      <section className="con-toolbar">
        <div className="con-toolbar-title">
          <h2>Alerts</h2>
          <div className="con-seg" role="tablist" aria-label="Alerts view">
            <button role="tab" aria-selected={tab === 'queue'} className={tab === 'queue' ? 'is-on' : ''} onClick={() => setTab('queue')}>
              Queue
            </button>
            <button role="tab" aria-selected={tab === 'log'} className={tab === 'log' ? 'is-on' : ''} onClick={() => setTab('log')}>
              Review log
            </button>
          </div>
        </div>
        <div className="con-toolbar-tools">
          <label className={`con-duty-field ${needName ? 'is-invalid' : ''}`}>
            <span>On duty</span>
            <input
              ref={nameRef}
              type="text"
              value={reviewer}
              onChange={(e) => {
                setReviewer(e.target.value)
                setNeedName(false)
              }}
              placeholder="Your name"
              maxLength={60}
              aria-invalid={needName}
              aria-describedby={needName ? 'need-name' : undefined}
            />
          </label>
          {alerts.some((a) => a.demo) && (
            <a className="con-btn" href="#/demo">
              ← Back to demo
            </a>
          )}
        </div>
      </section>

      <Guide onAlerts inLog={tab === 'log'} onOpenLog={() => setTab('log')} />

      <p className="review-notice" role="note">
        <strong>Action is not taken until a CCTV operator reviews the alert.</strong> Nothing is sent
        to police until a reviewer confirms it; dismissing records a false alarm.
      </p>
      {needName && (
        <p id="need-name" className="error small" role="alert">
          Type your name in On duty first: every decision is signed.
        </p>
      )}

      {tab === 'log' ? (
        <ReviewLog log={log} onClear={clearLog} />
      ) : (
        <section className={`incident ${openOnPhone && selected ? 'is-open' : ''}`}>
          <div className="incident-list">
            <div className="incident-filter" role="tablist">
              <button role="tab" aria-selected={show === 'pending'} className={show === 'pending' ? 'is-on' : ''} onClick={() => setShow('pending')}>
                Needs review <b>{pending.length}</b>
              </button>
              <button role="tab" aria-selected={show === 'all'} className={show === 'all' ? 'is-on' : ''} onClick={() => setShow('all')}>
                All <b>{alerts.length}</b>
              </button>
            </div>
            {shown.length === 0 ? (
              <p className="incident-empty">
                {alerts.length === 0 ? 'No alerts to be reviewed.' : 'All caught up. Every alert has been reviewed.'}
              </p>
            ) : (
              <ul>
                {shown.map((a) => {
                  const [id, label] = cameraLabel(a.camera)
                  return (
                    <li key={a.id}>
                      <button
                        className={`incident-item sev-${a.decision} ${selected?.id === a.id ? 'is-selected' : ''}`}
                        onClick={() => {
                          setSelectedId(a.id)
                          setOpenOnPhone(true)
                          // On a phone the alert opens on its own screen: start at its top.
                          requestAnimationFrame(() =>
                            document.querySelector('.incident-detail')?.scrollIntoView({ block: 'start' }),
                          )
                        }}
                      >
                        <span className="incident-cam">
                          <b>{id}</b> {label}
                        </span>
                        <span className="incident-meta">
                          Possible {a.label} · {Math.round(a.confidence * 100)}% ·{' '}
                          {new Date(a.raisedAt).toLocaleTimeString()}
                        </span>
                        <span className={`incident-status st-${a.decision}`}>
                          {STATUS[a.decision]}
                          {a.demo && <em>Demo replay</em>}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="incident-keys" aria-hidden="true">
              <kbd>C</kbd> confirm · <kbd>D</kbd> dismiss · <kbd>↑</kbd>
              <kbd>↓</kbd> move
            </p>
          </div>

          <div className="incident-detail">
            {selected ? (
              <>
                <button className="con-btn incident-back" onClick={() => setOpenOnPhone(false)}>
                  ← All alerts
                </button>
                <FlagCard key={selected.id} flag={selected} onDecide={(d) => onDecide(selected, d)} />
                {selected.decision !== 'pending' && selected.decidedAt && (
                  <p className="incident-audit">
                    Decided {new Date(selected.decidedAt).toLocaleString()} by {selected.reviewer}. Recorded in the
                    review log.
                  </p>
                )}
              </>
            ) : (
              <div className="incident-none">
                <p>Select an alert to review it.</p>
                {alerts.length === 0 && (
                  <p className="muted small">
                    Alerts appear here when a camera sees a possible gun. Start the <a href="#/demo">Demo</a> to see one.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      )}
    </Shell>
  )
}

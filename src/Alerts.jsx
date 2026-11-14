import { useRef, useState } from 'react'
import { Shell } from './Layout.jsx'
import FlagCard from './FlagCard.jsx'
import ReviewLog from './ReviewLog.jsx'
import { useStore } from './store.jsx'

export default function Alerts() {
  const { alerts, log, reviewer, setReviewer, decide, clearLog } = useStore()
  const [show, setShow] = useState('pending') // pending | all
  const pending = alerts.filter((a) => a.decision === 'pending')
  const shown = show === 'pending' ? pending : alerts
  const hasReviewer = reviewer.trim().length > 0
  const [needName, setNeedName] = useState(false)
  const nameRef = useRef(null)

  // Every decision is signed: without a name, send the reviewer to the name box first.
  function onDecide(id, decision) {
    if (!hasReviewer) {
      setNeedName(true)
      nameRef.current.focus()
      nameRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    decide(id, decision)
  }

  return (
    <Shell>
      <section className="panel">
        {alerts.some((a) => a.demo) && (
          <a className="back-link" href="#/demo">
            ← Back to demo
          </a>
        )}
        <h2>Alerts</h2>
        <p className="review-notice" role="note">
          <strong>Action is not taken until a CCTV operator reviews the alert.</strong>
        </p>
        <p className="muted">
          Every possible gun a camera flags lands here. Nothing is sent to police until a
          reviewer looks at the frame and confirms it. Dismissing a flag records it as a false
          alarm.
        </p>
        <div className="controls">
          <label className="field">
            <span>Reviewer name</span>
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
              className={needName ? 'invalid' : ''}
            />
            {needName && (
              <span id="need-name" className="error small">
                Type your name first: every decision is signed.
              </span>
            )}
          </label>
          <div className="tabs" role="tablist">
            <button
              role="tab"
              aria-selected={show === 'pending'}
              className={show === 'pending' ? 'tab tab-on' : 'tab'}
              onClick={() => setShow('pending')}
            >
              Needs review ({pending.length})
            </button>
            <button
              role="tab"
              aria-selected={show === 'all'}
              className={show === 'all' ? 'tab tab-on' : 'tab'}
              onClick={() => setShow('all')}
            >
              All ({alerts.length})
            </button>
          </div>
        </div>
      </section>

      {shown.length === 0 ? (
        <section className="panel empty">
          <p className="muted">
            {alerts.length === 0 ? (
              'No alerts to be reviewed.'
            ) : (
              'All caught up. Every alert has been reviewed.'
            )}
          </p>
        </section>
      ) : (
        <section className="flags">
          {!hasReviewer && <p className="muted">Enter your reviewer name above to confirm or dismiss alerts.</p>}
          {shown.map((alert) => (
            <FlagCard
              key={alert.id}
              flag={alert}
              onDecide={(decision) => onDecide(alert.id, decision)}
            />
          ))}
        </section>
      )}

      <ReviewLog log={log} onClear={clearLog} />
    </Shell>
  )
}

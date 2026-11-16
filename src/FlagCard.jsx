import { useState } from 'react'
import AlertClip from './AlertClip.jsx'
import { formatTime } from './reviewLog.js'

// One alert: the flagged frame (then, once recorded, a short clip around it), where it came
// from, and the reviewer's decision. An alert whose camera saw the gun more than once lists
// every sighting in a "Sightings" dropdown; choosing one shows its clip in the player, so
// there is only ever one clip on screen.
export default function FlagCard({ flag, onDecide }) {
  const seen = flag.seen ?? []
  const [shown, setShown] = useState(0) // which sighting's clip is in the player
  const sighting = seen[shown]
  const recording =
    shown === 0 || !sighting
      ? flag.recording
      : { ...flag.recording, start: sighting.start, end: sighting.end, ready: sighting.ready }

  return (
    <article className={`flag flag-${flag.decision}`}>
      {recording?.ready ? (
        <AlertClip key={shown} recording={recording} />
      ) : (
        <div className="flag-still">
          <img
            src={flag.image}
            alt={`${flag.camera}, ${formatTime(flag.time)} into the clip, flagged as a possible ${flag.label}`}
          />
          {recording && (
            <span className="recording" role="status">
              <span className="rec-dot" /> Recording the next few seconds…
            </span>
          )}
        </div>
      )}
      <div className="flag-body">
        <div className="flag-title">
          Possible {flag.label}
          <span className="score">{Math.round(flag.confidence * 100)}% confidence</span>
          {flag.demo && <span className="tag">Demo replay</span>}
        </div>
        <div className="muted">
          <strong className="flag-camera">{flag.camera}</strong> · {formatTime(flag.time)} into the
          clip · raised {new Date(flag.raisedAt).toLocaleTimeString()}
        </div>
        {seen.length > 1 && (
          <details className="sightings">
            <summary>
              Sightings <b>{seen.length}</b>
            </summary>
            <ol>
              {seen.map((s, k) => (
                <li key={s.n} className={k === shown ? 'is-shown' : ''}>
                  <span className="sightings-n">{k + 1}</span>
                  <span>{formatTime(s.time)}</span>
                  <span>{Math.round(s.confidence * 100)}%</span>
                  {k === shown ? (
                    <span className="sightings-state">Showing</span>
                  ) : s.ready ? (
                    <button type="button" className="con-btn" onClick={() => setShown(k)}>
                      ▶ View clip
                    </button>
                  ) : (
                    <span className="sightings-state">Recording…</span>
                  )}
                </li>
              ))}
            </ol>
          </details>
        )}
        {flag.decision === 'pending' ? (
          <div className="actions actions-left">
            <button className="button button-danger" onClick={() => onDecide('confirmed')}>
              Confirm threat
            </button>
            <button className="button" onClick={() => onDecide('dismissed')}>
              Dismiss
            </button>
          </div>
        ) : (
          <div className={`decision decision-${flag.decision}`}>
            {flag.decision === 'confirmed' ? 'Confirmed threat' : 'Dismissed as a false alarm'} by{' '}
            {flag.reviewer}
          </div>
        )}
      </div>
    </article>
  )
}

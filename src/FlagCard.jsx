import { formatTime } from './reviewLog.js'

// One alert: the flagged frame, where it came from, and the reviewer's decision.
export default function FlagCard({ flag, onDecide }) {
  return (
    <article className={`flag flag-${flag.decision}`}>
      <img
        src={flag.image}
        alt={`${flag.camera}, ${formatTime(flag.time)} into the clip, flagged as a possible ${flag.label}`}
      />
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

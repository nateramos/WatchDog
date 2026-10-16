import { formatTime } from './reviewLog.js'

// One flagged frame waiting for (or showing) a reviewer's decision.
export default function FlagCard({ flag, canDecide, hasReviewer, onDecide, onShow }) {
  return (
    <article className={`flag flag-${flag.decision}`}>
      <img src={flag.image} alt={`Frame at ${formatTime(flag.time)} flagged as a possible ${flag.label}`} />
      <div className="flag-body">
        <div className="flag-title">
          Possible {flag.label}
          <span className="score">{Math.round(flag.confidence * 100)}% confidence</span>
        </div>
        <div className="muted">
          At {formatTime(flag.time)} in the clip ·{' '}
          <button className="link" onClick={onShow}>
            Show in video
          </button>
        </div>
        {flag.decision === 'pending' ? (
          canDecide && (
            <div className="actions actions-left">
              <button className="button button-danger" disabled={!hasReviewer} onClick={() => onDecide('confirmed')}>
                Confirm threat
              </button>
              <button className="button" disabled={!hasReviewer} onClick={() => onDecide('dismissed')}>
                Dismiss
              </button>
            </div>
          )
        ) : (
          <div className={`decision decision-${flag.decision}`}>
            {flag.decision === 'confirmed' ? 'Confirmed' : 'Dismissed'} by {flag.reviewer}
          </div>
        )}
      </div>
    </article>
  )
}

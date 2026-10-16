import { useState } from 'react'
import { downloadCsv, formatTime } from './reviewLog.js'

// Every flag and reviewer decision, with CSV export and a two-step "Clear log".
export default function ReviewLog({ log, onClear }) {
  const [confirming, setConfirming] = useState(false)
  const empty = log.length === 0

  return (
    <section className="panel">
      <div className="log-head">
        <h3>Review log</h3>
        <div className="actions actions-left">
          <button className="button" onClick={() => downloadCsv(log)} disabled={empty}>
            Export CSV
          </button>
          {confirming ? (
            <>
              <button
                className="button button-danger"
                onClick={() => {
                  onClear()
                  setConfirming(false)
                }}
              >
                Yes, clear log
              </button>
              <button className="button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button className="button" onClick={() => setConfirming(true)} disabled={empty}>
              Clear log
            </button>
          )}
        </div>
      </div>
      {confirming && (
        <p className="muted small">
          This deletes every row in this browser's log. Export a CSV first if you want a copy.
        </p>
      )}
      {empty ? (
        <p className="muted">No flags yet. Every flag and every reviewer decision will be recorded here.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Logged</th>
                <th>Clip</th>
                <th>Time</th>
                <th>Object</th>
                <th>Confidence</th>
                <th>Decision</th>
                <th>Reviewer</th>
              </tr>
            </thead>
            <tbody>
              {log.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.loggedAt).toLocaleString()}</td>
                  <td>{row.clip}</td>
                  <td>{formatTime(row.videoTime)}</td>
                  <td>{row.label}</td>
                  <td>{Math.round(row.confidence * 100)}%</td>
                  <td className={`decision-${row.decision}`}>{row.decision}</td>
                  <td>{row.reviewer || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">The log is kept in this browser only.</p>
    </section>
  )
}

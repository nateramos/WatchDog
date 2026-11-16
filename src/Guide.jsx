import { useEffect } from 'react'
import { FINISHED, STEPS, guideStep } from './guide.js'
import { useStore } from './store.jsx'

// A step-by-step guide through the demo, on the Demo and Alerts pages, for first-time
// visitors such as judges. Before the demo starts it is a large panel with its own Start
// button, because the wall already shows ordinary footage and looks like it is running.
// After that it is a slim bar that moves on by itself as the demo plays, the alerts are
// reviewed and the Review log is opened (see guide.js). "Hide guide" shrinks it to a
// "Show guide" button.
//   onStart   starts (or replays) the demo; given on the Demo page only
//   onAlerts  the visitor is on the Alerts page
//   inLog     ...and on its Review log tab; onOpenLog switches to that tab
export default function Guide({ onStart, onAlerts = false, inLog = false, onOpenLog }) {
  const { demoRun, alerts, logRun, setLogRun, guideHidden, setGuideHidden } = useStore()
  const step = guideStep({ run: demoRun, alerts, onAlerts, logRun })

  // Opening the Review log after every alert is decided finishes the guide.
  useEffect(() => {
    if (inLog && step === 5) setLogRun(demoRun)
  }, [inLog, step, demoRun, setLogRun])

  if (guideHidden) {
    return (
      <div className="guide-show-row">
        <button type="button" className="guide-show" onClick={() => setGuideHidden(false)}>
          <span aria-hidden="true">?</span> Show guide
        </button>
      </div>
    )
  }

  const hide = (
    <button type="button" className="guide-hide" onClick={() => setGuideHidden(true)}>
      Hide guide
    </button>
  )

  if (step === 1 && onStart) {
    return (
      <section className="guide guide-intro" aria-label="Demo guide">
        <div>
          <p className="guide-count">Step 1 of {STEPS.length}</p>
          <h3>The cameras are showing an ordinary school day.</h3>
          <p>
            Press <b>Start demo</b> to replay a real attack on Camera 1 and see WatchDog catch it.
          </p>
        </div>
        <div className="guide-intro-actions">
          <button type="button" className="button button-primary con-start" onClick={onStart}>
            ▶ Start demo
          </button>
          {hide}
        </div>
      </section>
    )
  }

  return (
    <section className="guide" aria-label="Demo guide">
      <ol className="guide-steps">
        {STEPS.map((name, i) => {
          const n = i + 1
          const state = n < step ? 'done' : n === step ? 'now' : 'next'
          return (
            <li key={name} className={`is-${state}`} aria-current={n === step ? 'step' : undefined}>
              <span className="guide-dot">{state === 'done' ? '✓' : n}</span>
              {name}
            </li>
          )
        })}
      </ol>
      <div className="guide-now">
        <p aria-live="polite">
          <span className="guide-count">
            {step === FINISHED ? 'All done' : `Step ${step} of ${STEPS.length}`}
          </span>{' '}
          <Hint step={step} onAlerts={onAlerts} inLog={inLog} />
        </p>
        <div className="guide-now-actions">
          {step === 5 && onOpenLog && !inLog && (
            <button type="button" className="button button-primary" onClick={onOpenLog}>
              Open Review log
            </button>
          )}
          {step === FINISHED && onStart && (
            <button type="button" className="button" onClick={onStart}>
              Replay demo
            </button>
          )}
          {hide}
        </div>
      </div>
    </section>
  )
}

function Hint({ step, onAlerts, inLog }) {
  switch (step) {
    case 1:
      return (
        <>
          Go to the <a href="#/demo">Demo</a> page and press <b>Start demo</b>.
        </>
      )
    case 2:
      return (
        <>
          <b>Watch Camera 1</b>, top left. It starts playing about 10 seconds in, and its tile
          turns red when WatchDog spots a gun.
        </>
      )
    case 3:
      return (
        <>
          WatchDog flagged a possible gun. <a href="#/alerts">Open the alert</a> on the Alerts
          page.
        </>
      )
    case 4:
      return (
        <>
          Pick an alert and press <b>▶ Play</b> on its clip to see what WatchDog saw. Then type
          your name under <b>On duty</b> and press <b>Confirm threat</b> or <b>Dismiss</b>. A
          person decides, never WatchDog.
        </>
      )
    case 5:
      return onAlerts && !inLog ? (
        <>
          Open the <b>Review log</b>: every alert, what was decided, who decided and when.
        </>
      ) : (
        <>
          Every alert is reviewed. See the record in the <b>Review log</b> on the{' '}
          <a href="#/alerts">Alerts</a> page.
        </>
      )
    default:
      return (
        <>
          WatchDog flagged it, a person decided, and the decision is on record.
          {onAlerts && (
            <>
              {' '}
              <a href="#/demo">Back to the demo</a> to replay it.
            </>
          )}
        </>
      )
  }
}

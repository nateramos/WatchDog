import { useEffect, useRef, useState } from 'react'
import { Shell } from './Layout.jsx'
import Player, { drawBoxes } from './Player.jsx'
import { AlertBanner, OfflineTile } from './Cameras.jsx'
import { useStore } from './store.jsx'

// The camera wall, replaying a saved WatchDog run instead of checking frames live (which
// takes minutes on a laptop). Each feed's results file holds what WatchDog found in every
// checked frame and the alerts it raised, made with tracking/eval_clips.py: the same
// model and rules as the live check.
const FEEDS = [
  { id: 'demo-hallway', name: 'Camera 1 · Hallway', video: '/demo/demo_cam1_hallway.mp4', results: '/demo/demo_cam1_hallway.json' },
  { id: 'demo-lobby', name: 'Camera 2 · Lobby', video: '/demo/demo_cam2_lobby.mp4', results: '/demo/demo_cam2_lobby.json' },
]
const SLOTS = 4

// A still of the current frame with the alert's box drawn on it.
function snapshot(video, box) {
  const scale = Math.min(1, 960 / video.videoWidth)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  drawBoxes(ctx, [box], scale)
  return canvas.toDataURL('image/jpeg', 0.85)
}

function DemoTile({ feed, run, started }) {
  const { alerts, raiseAlert } = useStore()
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')
  const raised = useRef(new Set())
  const player = useRef(null)

  useEffect(() => {
    fetch(feed.results)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('missing'))))
      .then(setResults)
      .catch(() => setError('This demo feed is not available.'))
  }, [feed.results])

  // "Start demo" / "Replay demo" plays the clip from the beginning and lets its alerts fire again.
  useEffect(() => {
    raised.current = new Set()
    if (run > 0) player.current?.restart()
  }, [run])

  // Raise each saved alert when the clip reaches the moment WatchDog raised it.
  function onTimeUpdate(video) {
    if (!results) return
    results.alerts.forEach((alert, i) => {
      if (video.currentTime < alert.time || raised.current.has(i)) return
      raised.current.add(i)
      raiseAlert({
        id: `${feed.id}-${run}-${i}`,
        cameraId: feed.id,
        camera: feed.name,
        clip: feed.video.split('/').pop(),
        label: alert.label,
        confidence: alert.confidence,
        time: alert.time,
        image: snapshot(video, alert.box),
      })
    })
  }

  const pending = alerts.filter((a) => a.cameraId === feed.id && a.decision === 'pending').length
  return (
    <article className={`camera ${pending > 0 ? 'camera-alert' : ''}`}>
      <header className="camera-head">
        <span className="camera-name">{feed.name}</span>
        <span className="pill pill-done">Replay</span>
      </header>
      {error ? (
        <p className="error camera-error">{error}</p>
      ) : (
        <Player
          ref={player}
          src={feed.video}
          timeline={results?.timeline ?? []}
          step={results?.step ?? 0.25}
          ready={Boolean(results)}
          progress={0}
          autoPlay={started}
          onTimeUpdate={onTimeUpdate}
        />
      )}
      <footer className="camera-foot">
        <span className="muted small">
          {pending > 0 ? (
            <a href="#/alerts" className="camera-alerts">
              {pending} alert{pending > 1 ? 's' : ''} to review
            </a>
          ) : (
            'No alerts waiting'
          )}
        </span>
      </footer>
    </article>
  )
}

export default function Demo() {
  const { clearPending } = useStore()
  const [started, setStarted] = useState(false)
  const [run, setRun] = useState(0)

  // Start (or start over): clear the demo alerts nobody has reviewed and play every feed
  // from the beginning, so each alert fires again at its moment. Each run gets its own id
  // (the time it started), so its alerts never clash with ones from an earlier run, even
  // after leaving this page and coming back.
  function start() {
    clearPending(FEEDS.map((f) => f.id))
    setRun(Date.now())
    setStarted(true)
  }

  return (
    <Shell>
      <AlertBanner />

      <section className="panel">
        <h2>Demo</h2>
        <p className="muted">
          The camera wall replaying a saved WatchDog run on security camera footage that police
          released after the 2023 Covenant School shooting in Nashville (via The Washington
          Post). The boxes and alerts are WatchDog's real results from the same model and rules
          as a live check, saved ahead of time so the demo plays instantly. When an alert
          appears, open <a href="#/alerts">Alerts</a> to confirm or dismiss it. Press Start demo to
          begin.
        </p>
        <p className="muted small">Contains real footage of an armed attacker inside a school.</p>
        <div className="actions actions-left">
          {started ? (
            <button className="button" onClick={start}>
              Replay demo
            </button>
          ) : (
            <button className="button button-primary" onClick={start}>
              ▶ Start demo
            </button>
          )}
        </div>
      </section>

      <section className="camera-grid">
        {FEEDS.map((feed) => (
          <DemoTile key={feed.id} feed={feed} run={run} started={started} />
        ))}
        {Array.from({ length: SLOTS - FEEDS.length }, (_, i) => (
          <OfflineTile key={`slot-${i}`} name={`Camera ${FEEDS.length + i + 1}`} />
        ))}
      </section>
    </Shell>
  )
}

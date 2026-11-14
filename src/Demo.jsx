import { useEffect, useRef, useState } from 'react'
import { Shell } from './Layout.jsx'
import Player, { drawBoxes } from './Player.jsx'
import { AlertBanner, OfflineTile } from './Cameras.jsx'
import { useStore } from './store.jsx'
import { sightings } from './flags.js'

// The camera wall, replaying a saved WatchDog run instead of checking frames live (which
// takes minutes on a laptop). Each feed's results file holds what WatchDog found in every
// checked frame and the alerts it raised, made with tracking/eval_clips.py: the same
// model and rules as the live check.
const FEEDS = [
  { id: 'demo-hallway', name: 'Camera 1 · Hallway', video: '/demo/demo_cam1_hallway.mp4', results: '/demo/demo_cam1_hallway.json' },
  { id: 'demo-lobby', name: 'Camera 2 · Lobby', video: '/demo/demo_cam2_lobby.mp4', results: '/demo/demo_cam2_lobby.json' },
]
const SLOTS = 4
// Each alert gets a short clip around the first flag: this long before it, and this long
// after it (recorded as the feed keeps playing, so the clip arrives a few seconds later).
export const CLIP_BEFORE = 1
export const CLIP_AFTER = 4

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
  const { alerts, raiseAlert, updateAlert } = useStore()
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

  // Raise each alert the moment the gun is first seen, as the live check does, then swap in
  // the clearest frame once the clip reaches it (the saved alert's most confident frame).
  function onTimeUpdate(video) {
    if (!results) return
    const now = video.currentTime
    sightings(results.timeline).forEach((seen, i) => {
      const id = `${feed.id}-${run}-${i}`
      const best = results.alerts[i]
      if (now >= seen.start && !raised.current.has(id)) {
        raised.current.add(id)
        const clipEnd = Math.min(seen.start + CLIP_AFTER, video.duration)
        raiseAlert({
          id,
          cameraId: feed.id,
          camera: feed.name,
          clip: feed.video.split('/').pop(),
          label: seen.box.label,
          confidence: seen.box.confidence,
          time: seen.start,
          image: snapshot(video, seen.box),
          demo: true,
          recording: {
            src: feed.video,
            start: Math.max(0, seen.start - CLIP_BEFORE),
            end: clipEnd,
            timeline: results.timeline,
            step: results.step,
            ready: false,
          },
        })
        // The recording is ready once the feed has played past its end. A timer (not this
        // tile) finishes it, so it still arrives while the reviewer is on the Alerts page.
        const wait = Math.max(0, clipEnd - now) * 1000
        setTimeout(() => updateAlert(id, (a) => ({ recording: { ...a.recording, ready: true } })), wait)
      }
      const better = `${id}-best`
      if (best && now >= best.time && best.confidence > seen.box.confidence && !raised.current.has(better)) {
        raised.current.add(better)
        updateAlert(id, { confidence: best.confidence, image: snapshot(video, best.box) })
      }
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

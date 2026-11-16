import { useEffect, useRef, useState } from 'react'
import { Shell } from './Layout.jsx'
import Player, { drawBoxes } from './Player.jsx'
import { AlertBanner, AlertBar, CameraFilters, NoMatch, OfflineTile, TileOverlay, WallButtons, place, useWall } from './Cameras.jsx'
import Guide from './Guide.jsx'
import { useStore } from './store.jsx'
import { sightings } from './flags.js'
import { NO_FILTERS, passes } from './search.js'
import { SITE_CAMERAS } from './site.js'

// The camera wall, replaying a saved WatchDog run instead of checking frames live (which
// takes minutes on a laptop). Each feed's results file holds what WatchDog found in every
// checked frame and the alerts it raised, made with tracking/eval_clips.py: the same
// model and rules as the live check.
//
// The footage and results are not in this repo: they are served from a separate S3 bucket
// (public read of demo/ only, loadable from this site and localhost), so they can be taken
// down at any time without touching the code or its history.
const MEDIA = 'https://watchdog-demo-media-2026.s3.us-east-2.amazonaws.com/demo'
// One feed shows the attacker (Nashville, camera 1). The other live feeds show ordinary people
// from two public datasets, so the wall also shows WatchDog staying quiet on everyday footage:
// MEVA (an indoor school building, filmed with consenting actors) and ShanghaiTech Campus
// (outdoor walkways). The last cameras on the wall are offline, as some always are.
// The everyday feeds loop like real cameras. The attacker's feed waits 10 seconds on its first
// frame (an empty hallway), so viewers take in the quiet wall first, then plays once, so the
// footage is shown only as long as the detection needs (Replay demo plays it again on purpose).
const feed = (slot, id, file, { loop = true, delay = 0 } = {}) => ({
  ...SITE_CAMERAS[slot],
  id,
  status: 'live',
  video: `${MEDIA}/${file}.mp4`,
  results: `${MEDIA}/${file}.json`,
  loop,
  delay,
})
const FEEDS = [
  feed(0, 'demo-hallway', 'demo_cam1_hallway', { loop: false, delay: 10 }),
  feed(1, 'demo-east-hallway', 'demo_cam3_hallway'),
  feed(2, 'demo-cafeteria', 'demo_cam4_cafeteria'),
  feed(3, 'demo-gym', 'demo_cam5_gym'),
  feed(4, 'demo-walkway', 'demo_cam3_walkway'),
  feed(5, 'demo-plaza', 'demo_cam4_plaza'),
]
const OFFLINE = SITE_CAMERAS.slice(FEEDS.length).map((c) => ({ ...c, status: 'offline' }))
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

function DemoTile({ feed, run, started, hidden = false, onOpen }) {
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
  // A feed with a delay waits on its first frame first, so viewers take in the quiet wall
  // before that camera starts.
  const [holding, setHolding] = useState(false)
  useEffect(() => {
    raised.current = new Set()
    if (run === 0) return
    if (!feed.delay) {
      player.current?.restart()
      return
    }
    setHolding(true)
    player.current?.hold()
    const timer = setTimeout(() => {
      setHolding(false)
      player.current?.restart()
    }, feed.delay * 1000)
    return () => clearTimeout(timer)
  }, [run, feed.delay])

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
    <article className={`camera cctv ${pending > 0 ? 'camera-alert' : ''}`} hidden={hidden}>
      <div className="cctv-screen" onClick={onOpen} title={onOpen ? 'Open this camera large' : undefined}>
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
            autoPlay={started && !holding}
            loop={feed.loop}
            onTimeUpdate={onTimeUpdate}
          />
        )}
        <TileOverlay name={feed.name} tag="REPLAY" />
        {pending > 0 && <AlertBar />}
      </div>
      <footer className="cctv-foot">
        <span>
          {pending > 0 ? (
            <a href="#/alerts" className="camera-alerts">
              {pending} alert{pending > 1 ? 's' : ''} to review
            </a>
          ) : (
            'No alerts waiting'
          )}{' '}
          · {place(feed)}
        </span>
      </footer>
    </article>
  )
}

export default function Demo() {
  const { clearPending, demoRun: run, setDemoRun, guideHidden } = useStore()
  const started = run > 0
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState(NO_FILTERS)
  const wall = [...FEEDS, ...OFFLINE]
  const shown = wall.filter((c) => passes(c, query, filters)).length

  // Start (or start over): clear the demo alerts nobody has reviewed and play every feed
  // from the beginning, so each alert fires again at its moment. Each run gets its own id
  // (the time it started), so its alerts never clash with ones from an earlier run, even
  // after leaving this page and coming back.
  function start() {
    clearPending(FEEDS.map((f) => f.id))
    setDemoRun(Date.now())
  }

  const view = useWall()
  const isShown = (c) => passes(c, query, filters) && (!view.focus || view.focus === c.id)

  return (
    <Shell>
      <AlertBanner />
      <Guide onStart={start} />

      <section className="con-toolbar">
        <div className="con-toolbar-title">
          <h2>Demo replay</h2>
          <span className="con-chip">
            <i className="dot-replay" />
            {FEEDS.length} of {wall.length} cameras replaying
          </span>
        </div>
        <div className="con-toolbar-tools">
          <CameraFilters cameras={wall} query={query} onQuery={setQuery} filters={filters} onFilters={setFilters} />
          <WallButtons wall={view} />
          {started ? (
            <button className="button" onClick={start}>
              Replay demo
            </button>
          ) : (
            // While the guide shows its own large Start button, this one stays plain, so the
            // page has one obvious place to start.
            <button className={guideHidden ? 'button button-primary con-start' : 'button'} onClick={start}>
              ▶ Start demo
            </button>
          )}
        </div>
      </section>

      <p className="con-warning" role="note">
        <b>Content note</b> Camera 1 shows real security footage of an armed attacker inside a
        school, released by police after the 2023 Covenant School shooting in Nashville (via The
        Washington Post).
      </p>

      <details className="con-about">
        <summary>About this demo</summary>
        <p>
          A school&rsquo;s camera wall replaying a saved WatchDog run. The boxes and alerts are
          WatchDog&rsquo;s real results from the same model and rules as a live check, saved ahead
          of time so the demo plays instantly on any laptop. Press Start demo: about 10 seconds in,
          Camera 1 plays and raises its alerts. Open <a href="#/alerts">Alerts</a> to confirm or
          dismiss them.
        </p>
        <p>
          Camera names and locations are a sample building layout, not the real school&rsquo;s. Only
          Camera 1 shows the attacker. Cameras 2 to 6 show ordinary people from two public
          datasets, MEVA (an indoor school building, filmed with actors) and ShanghaiTech Campus
          (outdoor walkways), to show WatchDog staying quiet on everyday footage.
        </p>
      </details>

      {shown === 0 && <NoMatch />}
      <section className={`camera-grid cols-${view.cols} ${view.focus ? 'is-single' : ''}`}>
        {FEEDS.map((feed) => (
          <DemoTile
            key={feed.id}
            feed={feed}
            run={run}
            started={started}
            hidden={!isShown(feed)}
            onOpen={view.focus ? undefined : () => view.setFocus(feed.id)}
          />
        ))}
        {OFFLINE.map((camera) => (
          <OfflineTile key={camera.id} camera={camera} hidden={!isShown(camera)} />
        ))}
      </section>
    </Shell>
  )
}

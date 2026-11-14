import { Shell } from './Layout.jsx'
import Player from './Player.jsx'
import { useStore } from './store.jsx'
import { SITE_CAMERAS } from './site.js'

const STATUS_TEXT = {
  queued: 'Waiting',
  scanning: 'Checking',
  done: 'Watching',
  error: 'Error',
}

export function CameraTile({ camera, alertCount, pendingCount, onRemove }) {
  const checking = camera.status === 'scanning'
  return (
    <article className={`camera ${pendingCount > 0 ? 'camera-alert' : ''}`}>
      <header className="camera-head">
        <span className="camera-name">{camera.name}</span>
        <span className={`pill pill-${camera.status}`}>
          {STATUS_TEXT[camera.status]}
          {checking && ` ${Math.round(camera.progress * 100)}%`}
        </span>
      </header>
      {camera.status === 'error' ? (
        <p className="error camera-error">{camera.error}</p>
      ) : (
        <Player
          src={camera.url}
          timeline={camera.timeline}
          step={camera.step}
          ready={camera.status === 'done'}
          progress={camera.progress}
          loop
        />
      )}
      <footer className="camera-foot">
        <span className="muted small" title={camera.fileName}>
          {alertCount > 0 ? (
            <a href="#/alerts" className="camera-alerts">
              {alertCount} alert{alertCount > 1 ? 's' : ''}
            </a>
          ) : (
            'No alerts'
          )}{' '}
          · {camera.fileName}
        </span>
        <button className="link-button" onClick={onRemove}>
          Remove
        </button>
      </footer>
    </article>
  )
}

// Where a camera hangs, as shown under its picture: "Floor 1 · West wing".
export function place(camera) {
  return [camera.floor, camera.wing].filter(Boolean).join(' · ')
}

// An empty slot: no feed is connected to it yet.
export function OfflineTile({ camera }) {
  const { name } = camera
  return (
    <article className="camera camera-offline">
      <header className="camera-head">
        <span className="camera-name">{name}</span>
        <span className="pill">Offline</span>
      </header>
      <div className="offline-screen" role="img" aria-label={`${name} is offline`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 3l18 18" />
          <path d="M15 10.5 20 7v10l-1.5-1" />
          <path d="M8.5 6H13a2 2 0 0 1 2 2v4.5M15 16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2" />
        </svg>
        <span>Camera offline</span>
      </div>
      <footer className="camera-foot">
        <span className="muted small">{place(camera) || 'No feed connected'}</span>
      </footer>
    </article>
  )
}

// Red banner at the top of the camera wall while any alert is waiting for a reviewer.
export function AlertBanner() {
  const { alerts } = useStore()
  const pending = alerts.filter((a) => a.decision === 'pending').length
  if (pending === 0) return null
  return (
    <a className="alert-banner" href="#/alerts" role="alert">
      <strong>
        {pending} possible gun{pending > 1 ? 's' : ''} flagged
      </strong>
      <span>Review now →</span>
    </a>
  )
}

export default function Cameras() {
  const { cameras, alerts, removeCamera } = useStore()
  // Connected cameras fill the first slots of the building's layout; the rest are offline.
  const live = cameras.map((c, i) => ({ ...SITE_CAMERAS[i], ...c, status: 'live' }))
  const offline = SITE_CAMERAS.slice(cameras.length).map((c) => ({ ...c, status: 'offline' }))

  return (
    <Shell>
      <AlertBanner />

      <section className="panel">
        <h2>Cameras</h2>
        <p className="muted">
          Each camera's feed is checked about four times per second for a possible gun.
          Anything WatchDog finds goes to <a href="#/alerts">Alerts</a>, where a person confirms
          or dismisses it before anyone is called. Video is checked in this browser and never
          uploaded.
        </p>
      </section>

      <section className="camera-grid">
        {live.map((camera) => (
          <CameraTile
            key={camera.id}
            camera={camera}
            alertCount={alerts.filter((a) => a.cameraId === camera.id).length}
            pendingCount={alerts.filter((a) => a.cameraId === camera.id && a.decision === 'pending').length}
            onRemove={() => removeCamera(camera.id)}
          />
        ))}
        {offline.map((camera) => (
          <OfflineTile key={camera.id} camera={camera} />
        ))}
      </section>
    </Shell>
  )
}

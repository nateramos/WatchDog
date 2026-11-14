import { Shell } from './Layout.jsx'
import Player from './Player.jsx'
import { useEffect, useRef, useState } from 'react'
import { useStore } from './store.jsx'
import { FILTER_FIELDS, NO_FILTERS, filterOptions, passes } from './search.js'
import { SITE_CAMERAS } from './site.js'

const STATUS_TEXT = {
  queued: 'Waiting',
  scanning: 'Checking',
  done: 'Watching',
  error: 'Error',
}

export function CameraTile({ camera, alertCount, pendingCount, onRemove, hidden = false }) {
  const checking = camera.status === 'scanning'
  return (
    <article className={`camera ${pendingCount > 0 ? 'camera-alert' : ''}`} hidden={hidden}>
      <header className="camera-head">
        <span className="camera-name">{camera.name}</span>
        {pendingCount > 0 ? (
          <a href="#/alerts" className="pill pill-threat">
            Possible gun · Review
          </a>
        ) : (
          <span className={`pill pill-${camera.status}`}>
            {STATUS_TEXT[camera.status]}
            {checking && ` ${Math.round(camera.progress * 100)}%`}
          </span>
        )}
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
export function OfflineTile({ camera, hidden = false }) {
  const { name } = camera
  return (
    <article className="camera camera-offline" hidden={hidden}>
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

const FILTER_NAMES = { status: 'Status', area: 'Area', floor: 'Floor', wing: 'Wing' }
const VALUE_LABELS = { live: 'Live', offline: 'Offline' }

// One "Filters" button that opens a panel of choices for status, area, floor and wing. Each
// group offers only the values the wall's cameras have; clicking a choice again turns it off.
function FilterMenu({ options, filters, onFilters }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const active = FILTER_FIELDS.filter((f) => filters[f]).length
  const groups = FILTER_FIELDS.filter((f) => options[f].length > 1)

  // Close when clicking outside the menu or pressing Escape.
  useEffect(() => {
    if (!open) return
    const onClick = (e) => !menuRef.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="filter-menu" ref={menuRef}>
      <button
        className={`filter-button ${active ? 'filter-on' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        Filters{active > 0 && ` · ${active}`}
      </button>
      {open && (
        <div className="filter-panel" role="group" aria-label="Filter cameras">
          {groups.map((field) => (
            <div key={field} className="filter-group">
              <span className="filter-name">{FILTER_NAMES[field]}</span>
              <div className="chips">
                {options[field].map((value) => {
                  const on = filters[field] === value
                  return (
                    <button
                      key={value}
                      className={`chip ${on ? 'chip-on' : ''}`}
                      aria-pressed={on}
                      onClick={() => onFilters({ ...filters, [field]: on ? '' : value })}
                    >
                      {VALUE_LABELS[value] ?? value}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <div className="filter-actions">
            <button className="link-button" onClick={() => onFilters(NO_FILTERS)} disabled={!active}>
              Clear filters
            </button>
            <button className="button clip-toggle" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// The search box and Filters button above the camera wall. Cameras that don't pass are only
// hidden, so their feeds keep running (and raising alerts) while someone looks for a camera.
export function CameraFilters({ cameras, query, onQuery, filters, onFilters }) {
  const options = filterOptions(cameras)
  const shown = cameras.filter((c) => passes(c, query, filters)).length
  const narrowed = query.trim() || FILTER_FIELDS.some((f) => filters[f])
  return (
    <div className="camera-search">
      <div className="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search cameras"
          aria-label="Search cameras by name, number or place"
          maxLength={60}
        />
      </div>
      <FilterMenu options={options} filters={filters} onFilters={onFilters} />
      {narrowed && (
        <>
          <button
            className="link-button"
            onClick={() => {
              onQuery('')
              onFilters(NO_FILTERS)
            }}
          >
            Clear
          </button>
          <span className="muted small" role="status">
            {shown} of {cameras.length} cameras
          </span>
        </>
      )}
    </div>
  )
}

// Shown in place of the wall when no camera passes the search and filters.
export function NoMatch() {
  return (
    <section className="panel empty">
      <p className="muted">No camera matches this search and these filters.</p>
    </section>
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
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState(NO_FILTERS)
  // Connected cameras fill the first slots of the building's layout; the rest are offline.
  const live = cameras.map((c, i) => ({ ...SITE_CAMERAS[i], ...c, status: 'live' }))
  const offline = SITE_CAMERAS.slice(cameras.length).map((c) => ({ ...c, status: 'offline' }))
  const wall = [...live, ...offline]
  const shown = wall.filter((c) => passes(c, query, filters)).length

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
        <CameraFilters cameras={wall} query={query} onQuery={setQuery} filters={filters} onFilters={setFilters} />
      </section>

      {shown === 0 && <NoMatch />}
      <section className="camera-grid">
        {live.map((camera) => (
          <CameraTile
            key={camera.id}
            camera={camera}
            alertCount={alerts.filter((a) => a.cameraId === camera.id).length}
            pendingCount={alerts.filter((a) => a.cameraId === camera.id && a.decision === 'pending').length}
            onRemove={() => removeCamera(camera.id)}
            hidden={!passes(camera, query, filters)}
          />
        ))}
        {offline.map((camera) => (
          <OfflineTile key={camera.id} camera={camera} hidden={!passes(camera, query, filters)} />
        ))}
      </section>
    </Shell>
  )
}

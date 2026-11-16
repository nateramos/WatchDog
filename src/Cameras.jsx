import { Shell, useNow } from './Layout.jsx'
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

// Wall layout shared by the Cameras and Demo pages: how many cameras per row (2x2, 3x3, 4x4)
// and which camera, if any, is open large. Esc returns to the wall.
export function useWall() {
  const [cols, setCols] = useState(4)
  const [focus, setFocus] = useState(null)
  useEffect(() => {
    if (!focus) return
    const onKey = (e) => e.key === 'Escape' && setFocus(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [focus])
  return { cols, setCols, focus, setFocus }
}

export function WallButtons({ wall }) {
  const { cols, setCols, focus, setFocus } = wall
  if (focus) {
    return (
      <button className="con-btn" onClick={() => setFocus(null)}>
        ← Back to wall <kbd>Esc</kbd>
      </button>
    )
  }
  return (
    <div className="con-seg con-seg-layout" role="group" aria-label="Wall layout">
      {[2, 3, 4].map((n) => (
        <button key={n} className={cols === n ? 'is-on' : ''} aria-pressed={cols === n} onClick={() => setCols(n)}>
          {n}×{n}
        </button>
      ))}
    </div>
  )
}

// "Camera 1 · West hallway" -> ["CAM 01", "West hallway"]
export function cameraLabel(name) {
  const [first, ...rest] = name.split(' · ')
  const n = first.match(/\d+/)
  return [n ? `CAM ${n[0].padStart(2, '0')}` : first.toUpperCase(), rest.join(' · ')]
}

// The text a real CCTV system burns onto the picture: camera ID and name, a status tag and,
// on live feeds, a ticking timestamp. `tag` is what the feed really is: REPLAY, LIVE or OFFLINE.
export function TileOverlay({ name, tag }) {
  const now = useNow()
  const [id, label] = cameraLabel(name)
  const stamp = `${now.toLocaleDateString('en-CA')} ${now.toLocaleTimeString('en-GB')}`
  return (
    <div className="cctv-overlay" aria-hidden="true">
      <span className="cctv-id">
        <b>{id}</b> {label}
      </span>
      <span className="cctv-meta">
        <span className={`cctv-tag cctv-tag-${tag.toLowerCase()}`}>{tag}</span>
        {/* Replayed footage keeps its own recorded time; only live feeds get the clock. */}
        {tag === 'LIVE' && <span className="cctv-time">{stamp}</span>}
      </span>
    </div>
  )
}

// The red bar across a camera that has an alert waiting for review.
export function AlertBar() {
  return (
    <a className="cctv-alertbar" href="#/alerts">
      ⚠ POSSIBLE GUN · REVIEW
    </a>
  )
}

export function CameraTile({ camera, alertCount, pendingCount, onRemove, hidden = false }) {
  // On the wall `status` is live/offline (for the Filters menu); the clip's own progress is
  // kept in `scanStatus`.
  const state = camera.scanStatus ?? camera.status
  return (
    <article className={`camera cctv ${pendingCount > 0 ? 'camera-alert' : ''}`} hidden={hidden}>
      <div className="cctv-screen">
        {state === 'error' ? (
          <p className="error camera-error">{camera.error}</p>
        ) : (
          <Player
            src={camera.url}
            timeline={camera.timeline}
            step={camera.step}
            ready={state === 'done'}
            progress={camera.progress}
            loop
          />
        )}
        <TileOverlay name={camera.name} tag={state === 'done' ? 'LIVE' : STATUS_TEXT[state]?.toUpperCase() || 'LIVE'} />
        {pendingCount > 0 && <AlertBar />}
      </div>
      <footer className="cctv-foot">
        <span>
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
    <article className="camera cctv camera-offline" hidden={hidden}>
      <div className="cctv-screen">
        <div className="offline-screen" role="img" aria-label={`${name} is offline`}>
          <span className="no-signal">NO SIGNAL</span>
        </div>
        <TileOverlay name={name} tag="OFFLINE" />
      </div>
      <footer className="cctv-foot">
        <span>{place(camera) || 'No feed connected'}</span>
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

  const view = useWall()
  const isShown = (c) => passes(c, query, filters) && (!view.focus || view.focus === c.id)

  return (
    <Shell>
      <AlertBanner />

      <section className="con-toolbar">
        <div className="con-toolbar-title">
          <h2>Cameras</h2>
          <span className="con-chip">
            <i />
            {live.length} of {wall.length} cameras connected
          </span>
        </div>
        <div className="con-toolbar-tools">
          <CameraFilters cameras={wall} query={query} onQuery={setQuery} filters={filters} onFilters={setFilters} />
          <WallButtons wall={view} />
        </div>
      </section>

      {live.length === 0 && (
        <p className="con-about con-note">
          No live cameras are connected in this prototype. In a school, WatchDog would run on a
          computer on site and check every camera about four times a second. To see it work on
          real footage, open the <a href="#/demo">Demo</a>.
        </p>
      )}

      {shown === 0 && <NoMatch />}
      <section className={`camera-grid cols-${view.cols} ${view.focus ? 'is-single' : ''}`}>
        {live.map((camera) => (
          <CameraTile
            key={camera.id}
            camera={camera}
            alertCount={alerts.filter((a) => a.cameraId === camera.id).length}
            pendingCount={alerts.filter((a) => a.cameraId === camera.id && a.decision === 'pending').length}
            onRemove={() => removeCamera(camera.id)}
            hidden={!isShown(camera)}
          />
        ))}
        {offline.map((camera) => (
          <OfflineTile key={camera.id} camera={camera} hidden={!isShown(camera)} />
        ))}
      </section>
    </Shell>
  )
}

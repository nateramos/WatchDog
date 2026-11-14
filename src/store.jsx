import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { scanClip } from './scan.js'
import { loadModel } from './detector.js'
import { logRow, mergeAlerts, upsertRows } from './flags.js'
import { LOG_KEY, REVIEWER_KEY, readStored, writeStored } from './storage.js'

// Everything the Cameras, Demo and Alerts pages share. Cameras and alerts last until
// the page is reloaded (the clips stay in this browser and are never uploaded); the review
// log and reviewer name are saved in the browser.
const Store = createContext(null)

export function useStore() {
  return useContext(Store)
}

let nextCamera = 1

export function StoreProvider({ children }) {
  const [cameras, setCameras] = useState([])
  const [alerts, setAlerts] = useState([])
  // Alerts don't survive a reload, so rows still pending from an earlier visit can never be
  // reviewed: start without them. Confirmed and dismissed rows are kept.
  const [log, setLog] = useState(() => readStored(LOG_KEY, []).filter((r) => r.decision !== 'pending'))
  const [reviewer, setReviewer] = useState(() => readStored(REVIEWER_KEY, ''))
  const scanning = useRef(null) // { id } of the scan that should keep going, or null
  const busy = useRef(false) // a scan is still running (even if cancelled)
  const canvas = useRef(null)

  useEffect(() => writeStored(LOG_KEY, log), [log])
  useEffect(() => writeStored(REVIEWER_KEY, reviewer), [reviewer])

  // Every alert, and every change to one, is written to the review log.
  useEffect(() => {
    if (alerts.length) setLog((prev) => upsertRows(prev, alerts.map(logRow)))
  }, [alerts])

  // Start downloading the model as soon as someone signs in.
  useEffect(() => {
    loadModel().catch(() => {})
  }, [])

  const updateCamera = useCallback((id, changes) => {
    setCameras((prev) => prev.map((c) => (c.id === id ? { ...c, ...changes } : c)))
  }, [])

  // The model runs one frame at a time, so cameras are checked one after another. A scan
  // that was cancelled (camera removed, or everything re-checked) finishes its current
  // frame before the next one starts.
  useEffect(() => {
    if (busy.current) return
    const camera = cameras.find((c) => c.status === 'queued')
    if (!camera) return
    const token = { id: camera.id }
    scanning.current = token
    busy.current = true
    canvas.current ??= document.createElement('canvas')
    updateCamera(camera.id, { status: 'scanning', progress: 0, error: '' })

    const stillHere = () => scanning.current === token
    scanClip(camera.url, {
      canvas: canvas.current,
      isCancelled: () => !stillHere(),
      onUpdate: ({ progress, step, timeline, flags }) => {
        if (!stillHere()) return
        updateCamera(camera.id, { progress, step, timeline })
        if (flags.length) setAlerts((prev) => mergeAlerts(prev, flags, camera))
      },
    })
      .then((result) => {
        if (result && stillHere()) updateCamera(camera.id, { status: 'done', progress: 1 })
      })
      .catch((err) => {
        if (stillHere()) {
          updateCamera(camera.id, {
            status: 'error',
            error: err.message || 'Something went wrong while checking the video.',
          })
        }
      })
      .finally(() => {
        if (stillHere()) scanning.current = null
        busy.current = false
        setCameras((prev) => [...prev]) // look for the next queued camera
      })
  }, [cameras, updateCamera])

  function addCamera(file, name) {
    const id = `cam-${Date.now()}-${nextCamera}`
    const camera = {
      id,
      name: name.trim() || `Camera ${nextCamera}`,
      fileName: file.name,
      url: URL.createObjectURL(file),
      status: 'queued',
      progress: 0,
      step: 0.25,
      timeline: [],
      error: '',
    }
    nextCamera += 1
    setCameras((prev) => [...prev, camera])
  }

  function removeCamera(id) {
    if (scanning.current?.id === id) scanning.current = null
    setCameras((prev) => {
      const camera = prev.find((c) => c.id === id)
      if (camera) URL.revokeObjectURL(camera.url)
      return prev.filter((c) => c.id !== id)
    })
  }

  // Add one ready-made alert (the Demo page replays saved results this way). An alert
  // that is already in the list is left alone.
  function raiseAlert(alert) {
    setAlerts((prev) =>
      prev.some((a) => a.id === alert.id)
        ? prev
        : [{ ...alert, raisedAt: new Date().toISOString(), decision: 'pending', reviewer: '', decidedAt: '' }, ...prev],
    )
  }

  // Change some fields of one alert (an object, or a function of the alert that returns one).
  function updateAlert(id, changes) {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...(typeof changes === 'function' ? changes(a) : changes) } : a)),
    )
  }

  // Remove the alerts nobody has reviewed yet from these cameras, and their review-log rows:
  // they can no longer be reviewed, so they would sit in the log as "pending" forever.
  // Confirmed and dismissed alerts stay, in both places.
  function clearPending(cameraIds) {
    const gone = new Set(
      alerts.filter((a) => a.decision === 'pending' && cameraIds.includes(a.cameraId)).map((a) => a.id),
    )
    setAlerts((prev) => prev.filter((a) => !gone.has(a.id)))
    setLog((prev) => prev.filter((r) => !gone.has(r.id)))
  }

  function decide(id, decision) {
    const name = reviewer.trim()
    const decidedAt = new Date().toISOString()
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, decision, reviewer: name, decidedAt } : a)))
  }

  const value = {
    cameras,
    alerts,
    log,
    reviewer,
    addCamera,
    removeCamera,
    raiseAlert,
    updateAlert,
    clearPending,
    decide,
    setReviewer,
    clearLog: () => setLog([]),
  }
  return <Store.Provider value={value}>{children}</Store.Provider>
}

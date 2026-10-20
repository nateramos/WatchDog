import { useEffect, useRef, useState } from 'react'
import { Shell } from './Layout.jsx'
import Player, { drawBoxes } from './Player.jsx'
import Stages from './Stages.jsx'
import FlagCard from './FlagCard.jsx'
import ReviewLog from './ReviewLog.jsx'
import { detect, loadModel, FLAG_CONF } from './detector.js'
import { confirmBoxes } from './boxes.js'
import { readStored, writeStored } from './storage.js'

const SAMPLE = {
  url: '/samples/sample-pexels-4006667.mp4',
  name: 'Pexels stock clip #4006667',
}
const MAX_SAMPLES = 120 // frames checked per clip, so long clips stay quick
const MIN_STEP = 0.5 // seconds between checked frames
const MERGE_GAP = 1.5 // flags of the same kind closer than this are one event
const LOG_KEY = 'watchdog-review-log'
const REVIEWER_KEY = 'watchdog-reviewer'

function waitFor(video, event) {
  return new Promise((resolve, reject) => {
    const done = () => {
      video.removeEventListener(event, done)
      video.removeEventListener('error', fail)
      resolve()
    }
    const fail = () => {
      video.removeEventListener(event, done)
      reject(new Error('This video could not be read. Try an MP4 (H.264) file, or run the demo video.'))
    }
    video.addEventListener(event, done, { once: true })
    video.addEventListener('error', fail, { once: true })
  })
}

// A still of the flagged frame with the detection box drawn on it.
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

export default function Demo() {
  const [reviewer, setReviewer] = useState(() => readStored(REVIEWER_KEY, ''))
  const [log, setLog] = useState(() => readStored(LOG_KEY, []))
  const [clip, setClip] = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | scanning | done | error
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [flags, setFlags] = useState([])
  const [timeline, setTimeline] = useState([]) // [{ t, boxes }] for every checked frame
  const [step, setStep] = useState(MIN_STEP)
  const playerRef = useRef(null)
  const canvasRef = useRef(null)
  const scanId = useRef(0)

  useEffect(() => writeStored(LOG_KEY, log), [log])
  useEffect(() => writeStored(REVIEWER_KEY, reviewer), [reviewer])

  // Start downloading the model as soon as the demo opens.
  useEffect(() => {
    loadModel().catch(() => {})
  }, [])

  async function scan(url, name) {
    const id = ++scanId.current
    setClip({ url, name })
    setFlags([])
    setTimeline([])
    setError('')
    setProgress(0)
    setStatus('loading')

    try {
      await loadModel()
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.preload = 'auto'
      const loaded = waitFor(video, 'loadeddata')
      video.src = url
      await loaded

      setStatus('scanning')
      const duration = video.duration
      const step = Math.max(MIN_STEP, duration / MAX_SAMPLES)
      setStep(step)
      const found = []
      const checked = [] // every checked frame, with the boxes the model found
      const timeline = [] // the same frames, keeping only boxes seen two frames in a row

      // A frame is final once the frames on both sides of it have been checked.
      const finish = (i) => {
        const { t, boxes } = checked[i]
        const kept = confirmBoxes(boxes, [checked[i - 1], checked[i + 1]])
        timeline.push({ t, boxes: kept })
        for (const box of kept) {
          const last = found.findLast((f) => f.label === box.label)
          if (last && t - last.lastTime <= MERGE_GAP) {
            last.lastTime = t
            if (box.confidence > last.confidence) {
              Object.assign(last, { time: t, confidence: box.confidence, image: box.image })
            }
          } else {
            found.push({
              id: `${Date.now()}-${found.length}`,
              label: box.label,
              confidence: box.confidence,
              time: t,
              lastTime: t,
              image: box.image,
              decision: 'pending',
            })
          }
        }
        setFlags(found.map((f) => ({ ...f })))
        setTimeline([...timeline])
      }

      for (let t = 0; t < duration; t += step) {
        if (scanId.current !== id) return // a newer clip was chosen
        const seeked = waitFor(video, 'seeked')
        video.currentTime = t
        await seeked

        const boxes = await detect(video, video.videoWidth, video.videoHeight, canvasRef.current)
        // Snapshot now, while this frame is on screen; the box may only be confirmed later.
        checked.push({ t, boxes: boxes.map((box) => ({ ...box, image: snapshot(video, box) })) })
        if (checked.length > 1) finish(checked.length - 2)
        setProgress(Math.min(1, (t + step) / duration))
      }
      if (checked.length > 0) finish(checked.length - 1)

      // Every flag goes into the log as pending until a reviewer decides.
      const loggedAt = new Date().toISOString()
      setLog((prev) => [
        ...found.map((f) => ({
          id: f.id,
          loggedAt,
          clip: name,
          videoTime: f.time,
          label: f.label,
          confidence: f.confidence,
          decision: 'pending',
          reviewer: '',
          decidedAt: '',
        })),
        ...prev,
      ])
      setStatus('done')
    } catch (err) {
      if (scanId.current !== id) return
      setError(err.message || 'Something went wrong while checking the video.')
      setStatus('error')
    }
  }

  function onUpload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (clip && clip.url.startsWith('blob:')) URL.revokeObjectURL(clip.url)
    scan(URL.createObjectURL(file), file.name)
  }

  function decide(flag, decision) {
    const decidedAt = new Date().toISOString()
    const name = reviewer.trim()
    setFlags((prev) => prev.map((f) => (f.id === flag.id ? { ...f, decision, reviewer: name } : f)))
    setLog((prev) =>
      prev.map((row) => (row.id === flag.id ? { ...row, decision, reviewer: name, decidedAt } : row)),
    )
  }

  const busy = status === 'loading' || status === 'scanning'
  const pending = flags.filter((f) => f.decision === 'pending').length
  const hasReviewer = reviewer.trim().length > 0

  return (
    <Shell>
      <Stages />

      <section className="panel">
        <h2>Review demo</h2>
        <p className="muted">
          Enter your name as the reviewer, then upload one clip or run the demo video. WatchDog
          checks about two frames per second for a possible gun (confidence{' '}
          {Math.round(FLAG_CONF * 100)}% or higher). A human reviewer must confirm or dismiss
          every flag before any alert goes out. Your clip is analyzed in this browser and is never
          sent to a server.
        </p>

        <div className="controls">
          <label className="field">
            <span>Reviewer name</span>
            <input
              type="text"
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
              placeholder="Your name"
              maxLength={60}
            />
          </label>
          <div className="actions actions-left">
            <label className={`button button-primary ${busy ? 'disabled' : ''}`}>
              Upload a clip
              <input type="file" accept="video/*" onChange={onUpload} disabled={busy} hidden />
            </label>
            <button className="button" onClick={() => scan(SAMPLE.url, SAMPLE.name)} disabled={busy}>
              Run demo video
            </button>
          </div>
        </div>

        {clip && (
          <div className="status">
            <span className="muted">Clip:</span> {clip.name}
            {status === 'loading' && <span className="muted"> · Loading detection model…</span>}
            {status === 'scanning' && (
              <>
                <span className="muted"> · Checking frames… {Math.round(progress * 100)}%</span>
                <div className="bar">
                  <div style={{ width: `${progress * 100}%` }} />
                </div>
              </>
            )}
            {status === 'done' && (
              <span className="muted">
                {' '}
                · Done. {flags.length === 0 ? 'No possible weapons found.' : `${flags.length} flag${flags.length > 1 ? 's' : ''}, ${pending} awaiting review.`}
              </span>
            )}
            {status === 'error' && <p className="error">{error}</p>}
          </div>
        )}
        <canvas ref={canvasRef} hidden />
      </section>

      {clip && (
        <section className="panel">
          <Player
            ref={playerRef}
            src={clip.url}
            timeline={timeline}
            step={step}
            ready={status === 'done'}
            progress={progress}
          />
          <p className="muted small">
            The video plays once every frame has been checked. Press play to watch it again.
          </p>
        </section>
      )}

      {flags.length > 0 && (
        <section className="flags">
          {!hasReviewer && <p className="muted">Enter your name above to confirm or dismiss flags.</p>}
          {flags.map((flag) => (
            <FlagCard
              key={flag.id}
              flag={flag}
              canDecide={status === 'done'}
              hasReviewer={hasReviewer}
              onDecide={(decision) => decide(flag, decision)}
              onShow={() => playerRef.current?.seek(flag.time)}
            />
          ))}
        </section>
      )}

      <ReviewLog log={log} onClear={() => setLog([])} />

      <p className="muted small">
        Sample clip: Pexels video #4006667, free to use under the{' '}
        <a href="https://www.pexels.com/license/">Pexels License</a>.
      </p>
    </Shell>
  )
}

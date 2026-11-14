import { useEffect, useRef, useState } from 'react'
import { Shell } from './Layout.jsx'
import Player from './Player.jsx'
import FlagCard from './FlagCard.jsx'
import ReviewLog from './ReviewLog.jsx'
import { loadModel, FLAG_CONF } from './detector.js'
import { MIN_STEP, scanClip } from './scan.js'
import { LOG_KEY, REVIEWER_KEY, readStored, writeStored } from './storage.js'

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
      const result = await scanClip(url, {
        canvas: canvasRef.current,
        isCancelled: () => scanId.current !== id, // a newer clip was chosen
        onUpdate: ({ progress, step, timeline, flags }) => {
          if (scanId.current !== id) return
          setStatus('scanning')
          setStep(step)
          setProgress(progress)
          setTimeline(timeline)
          setFlags(flags)
        },
      })
      if (!result) return
      const found = result.flags

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
      <section className="panel">
        <h2>Review demo</h2>
        <p className="muted">
          Enter your name as the reviewer, then upload a clip. WatchDog
          checks about four frames per second for a possible gun (confidence{' '}
          {Math.round(FLAG_CONF * 100)}% or higher) and only flags one it finds in two checked
          frames in a row, which filters out one-frame false alarms. A human reviewer must confirm or dismiss
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
          </div>
          <p className="muted small">
            The demo video is being updated.
          </p>
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
    </Shell>
  )
}

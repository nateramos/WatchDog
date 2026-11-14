import { useEffect, useRef, useState } from 'react'
import { boxesAt } from './boxes.js'
import { drawBoxes } from './Player.jsx'
import { formatTime } from './reviewLog.js'

// Move the slider and its red fill (the --pct the CSS colors the played part of the track with).
function setSlider(slider, value) {
  slider.value = value
  const min = Number(slider.min)
  const max = Number(slider.max)
  slider.style.setProperty('--pct', `${((value - min) / (max - min)) * 100}%`)
}

// The few seconds around an alert, with every detection in those seconds boxed. It waits on
// its first frame until the reviewer presses Play, plays once and stops at the end (Play
// again starts it over). Pause stops it on the current frame so a reviewer can look
// closely; dragging the slider moves through the clip frame by frame (and pauses it).
export default function AlertClip({ recording }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const barRef = useRef(null)
  const [paused, setPaused] = useState(true)
  const pausedRef = useRef(true)
  pausedRef.current = paused
  const pendingSeek = useRef(null) // where the slider was dragged while a seek was still loading
  const { src, start, end, timeline, step } = recording

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    let frame = 0

    // While dragging, ask for one frame at a time: start the next seek only when the last
    // one has shown its frame, so the picture keeps up with the slider.
    const onSeeked = () => {
      if (pendingSeek.current === null) return
      video.currentTime = pendingSeek.current
      pendingSeek.current = null
    }
    video.addEventListener('seeked', onSeeked)

    const toStart = () => {
      video.currentTime = start
    }
    if (video.readyState >= 1) toStart()
    else video.addEventListener('loadedmetadata', toStart, { once: true })

    const draw = () => {
      // Stop at the end of the clip.
      if (!pausedRef.current && (video.currentTime >= end || video.ended)) {
        video.pause()
        pausedRef.current = true
        setPaused(true)
      }
      if (video.videoWidth) {
        const scale = Math.min(1, 960 / video.videoWidth)
        const w = Math.round(video.videoWidth * scale)
        const h = Math.round(video.videoHeight * scale)
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w
          canvas.height = h
          canvas.parentElement.style.aspectRatio = `${w} / ${h}`
        }
        const now = video.currentTime
        // Redraw the boxes only once the frame for this moment is on screen, so they always
        // match the picture.
        if (!video.seeking) {
          const ctx = canvas.getContext('2d')
          ctx.clearRect(0, 0, w, h)
          drawBoxes(ctx, boxesAt(timeline, now, step), scale)
        }
        // The slider follows the clip while it plays; while paused it is the reviewer's to move.
        if (!pausedRef.current) setSlider(barRef.current, Math.min(end, Math.max(start, now)))
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      video.removeEventListener('loadedmetadata', toStart)
      video.removeEventListener('seeked', onSeeked)
    }
  }, [src, start, end, timeline, step])

  function toggle() {
    const video = videoRef.current
    if (paused) {
      if (video.currentTime >= end || video.currentTime < start) video.currentTime = start
      video.play().catch(() => {})
    } else {
      video.pause()
    }
    setPaused(!paused)
  }

  function scrub(event) {
    const video = videoRef.current
    if (!paused) {
      video.pause()
      setPaused(true)
    }
    const target = Number(event.target.value)
    setSlider(event.target, target)
    if (video.seeking) pendingSeek.current = target
    else video.currentTime = target
  }

  return (
    <figure className="alert-clip">
      <div className="player">
        <video ref={videoRef} src={src} muted playsInline preload="auto" />
        <canvas ref={canvasRef} aria-hidden="true" />
      </div>
      <input
        ref={barRef}
        className="clip-scrub"
        type="range"
        min={start}
        max={end}
        step="0.01"
        defaultValue={start}
        onInput={scrub}
        aria-label="Move through the clip"
      />
      <figcaption className="clip-caption muted small">
        <button className="button clip-toggle" onClick={toggle} aria-pressed={paused}>
          {paused ? '▶ Play' : '❚❚ Pause'}
        </button>
        Clip {formatTime(start)}–{formatTime(end)} of the feed
      </figcaption>
    </figure>
  )
}

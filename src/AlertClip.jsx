import { useEffect, useRef, useState } from 'react'
import { boxesAt } from './boxes.js'
import { drawBoxes } from './Player.jsx'
import { formatTime } from './reviewLog.js'

// The few seconds around an alert, with every detection in those seconds boxed. It waits on
// its first frame until the reviewer presses Play, plays once and stops at the end (Play
// again starts it over). Pause stops it on the current frame so a reviewer can look
// closely.
export default function AlertClip({ recording }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [paused, setPaused] = useState(true)
  const pausedRef = useRef(true)
  pausedRef.current = paused
  const { src, start, end, timeline, step } = recording

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    let frame = 0

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
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, w, h)
        drawBoxes(ctx, boxesAt(timeline, video.currentTime, step), scale)
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      video.removeEventListener('loadedmetadata', toStart)
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

  return (
    <figure className="alert-clip">
      <div className="player">
        <video ref={videoRef} src={src} muted playsInline preload="auto" />
        <canvas ref={canvasRef} aria-hidden="true" />
      </div>
      <figcaption className="clip-caption muted small">
        <button className="button clip-toggle" onClick={toggle} aria-pressed={paused}>
          {paused ? '▶ Play' : '❚❚ Pause'}
        </button>
        Clip {formatTime(start)}–{formatTime(end)} of the feed
      </figcaption>
    </figure>
  )
}

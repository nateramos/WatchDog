import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { boxesAt } from './boxes.js'

// Red boxes around each detection, each with a "POSSIBLE GUN 84%" tag sitting on top of
// the box (or under it when the box touches the top edge), drawn in a canvas `scale` times
// the video size. The tags stay next to their box so they never cover the timestamp that
// CCTV cameras burn into a corner of the picture.
export function drawBoxes(ctx, boxes, scale) {
  const { width, height } = ctx.canvas
  const line = Math.max(2, width / 240)
  const textHeight = Math.round(Math.max(11, width / 70))
  const pad = Math.round(textHeight * 0.4)
  const tagHeight = textHeight + pad * 2
  ctx.font = `700 ${textHeight}px system-ui, sans-serif`
  ctx.textBaseline = 'top'
  for (const box of boxes) {
    const x = box.x * scale
    const y = box.y * scale
    const w = box.w * scale
    const h = box.h * scale
    ctx.strokeStyle = '#f43f5e'
    ctx.lineWidth = line
    ctx.strokeRect(x, y, w, h)

    const label = `POSSIBLE ${box.label.toUpperCase()} ${Math.round(box.confidence * 100)}%`
    const tagWidth = ctx.measureText(label).width + pad * 2
    const tagX = Math.min(Math.max(0, x - line / 2), width - tagWidth)
    const above = y - line / 2 - tagHeight
    const tagY = above >= 0 ? above : Math.min(y + h + line / 2, height - tagHeight)
    ctx.fillStyle = '#f43f5e'
    ctx.fillRect(tagX, tagY, tagWidth, tagHeight)
    ctx.fillStyle = '#fff'
    ctx.fillText(label, tagX + pad, tagY + pad)
  }
}

// The clip at full frame rate, with detection boxes drawn on top as it plays. It stays
// paused on the first frame until every frame has been checked (`ready`), then plays (once,
// or over and over with `loop`, like a camera feed), so the boxes are there from the start.
const Player = forwardRef(function Player({ src, timeline, step, ready, progress, loop = false }, ref) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const data = useRef({ timeline, step })
  data.current = { timeline, step }

  useImperativeHandle(ref, () => ({
    seek(time) {
      const video = videoRef.current
      video.pause()
      video.currentTime = time
      video.scrollIntoView({ behavior: 'smooth', block: 'center' })
    },
  }))

  useEffect(() => {
    const video = videoRef.current
    video.pause()
    video.currentTime = 0
    if (ready) video.play().catch(() => {}) // muted, so browsers allow it
  }, [ready, src])

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    let frame = 0

    const draw = () => {
      if (video.videoWidth) {
        const scale = Math.min(1, 1280 / video.videoWidth)
        const w = Math.round(video.videoWidth * scale)
        const h = Math.round(video.videoHeight * scale)
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w
          canvas.height = h
          canvas.parentElement.style.aspectRatio = `${w} / ${h}`
        }
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, w, h)
        const { timeline, step } = data.current
        drawBoxes(ctx, boxesAt(timeline, video.currentTime, step), scale)
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="player">
      <video ref={videoRef} src={src} controls={ready} loop={loop} muted playsInline />
      <canvas ref={canvasRef} aria-hidden="true" />
      {!ready && (
        <div className="player-wait" role="status">
          Checking frames… {Math.round(progress * 100)}%
        </div>
      )}
    </div>
  )
})

export default Player

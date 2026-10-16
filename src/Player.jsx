import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { boxesAt } from './boxes.js'

// Red boxes around each detection, plus a "POSSIBLE GUN 84%" readout per box stacked in
// the top-left corner, drawn in a canvas `scale` times the video size.
export function drawBoxes(ctx, boxes, scale) {
  const width = ctx.canvas.width
  const line = Math.max(2, width / 240)
  ctx.strokeStyle = '#f43f5e'
  ctx.lineWidth = line
  for (const box of boxes) ctx.strokeRect(box.x * scale, box.y * scale, box.w * scale, box.h * scale)

  const textHeight = Math.round(Math.max(11, width / 70))
  const pad = Math.round(textHeight * 0.45)
  const margin = Math.round(textHeight * 0.8)
  ctx.font = `700 ${textHeight}px system-ui, sans-serif`
  ctx.textBaseline = 'top'
  boxes.forEach((box, i) => {
    const text = `POSSIBLE ${box.label.toUpperCase()} ${Math.round(box.confidence * 100)}%`
    const y = margin + i * (textHeight + pad * 3)
    ctx.fillStyle = '#f43f5e'
    ctx.fillRect(margin, y, ctx.measureText(text).width + pad * 2, textHeight + pad * 2)
    ctx.fillStyle = '#fff'
    ctx.fillText(text, margin + pad, y + pad)
  })
}

// The clip at full frame rate, with detection boxes drawn on top as it plays.
const Player = forwardRef(function Player({ src, timeline, step }, ref) {
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
      <video ref={videoRef} src={src} controls muted playsInline loop autoPlay />
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  )
})

export default Player

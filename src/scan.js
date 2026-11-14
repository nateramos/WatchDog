import { drawBoxes } from './Player.jsx'
import { detect, loadModel, FLAG_CONF } from './detector.js'
import { confirmBoxes } from './boxes.js'
import { addToFlags } from './flags.js'

const MAX_SAMPLES = 120 // frames checked per clip, so long clips stay quick
export const MIN_STEP = 0.25 // seconds between checked frames: often enough to see a gun twice in a row

function waitFor(video, event) {
  return new Promise((resolve, reject) => {
    const done = () => {
      video.removeEventListener(event, done)
      video.removeEventListener('error', fail)
      resolve()
    }
    const fail = () => {
      video.removeEventListener(event, done)
      reject(new Error('This video could not be read. Try an MP4 (H.264) file.'))
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

// Check a clip a few frames per second. Calls onUpdate({ progress, step, timeline, flags })
// as it goes and returns the final { step, timeline, flags }. Stops early (returning null)
// once isCancelled() is true.
export async function scanClip(url, { canvas, minConf = FLAG_CONF, onUpdate = () => {}, isCancelled = () => false }) {
  await loadModel()
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  const loaded = waitFor(video, 'loadeddata')
  video.src = url
  await loaded

  const duration = video.duration
  const step = Math.max(MIN_STEP, duration / MAX_SAMPLES)
  const flags = []
  const checked = [] // every checked frame, with the boxes the model found
  const timeline = [] // the same frames, keeping only boxes seen two frames in a row
  let count = 0
  const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${count++}`
  const report = (progress) =>
    onUpdate({ progress, step, timeline: [...timeline], flags: flags.map((f) => ({ ...f })) })

  // A frame is final once the frames on both sides of it have been checked.
  const finish = (i) => {
    const { t, boxes } = checked[i]
    const kept = confirmBoxes(boxes, [checked[i - 1], checked[i + 1]])
    timeline.push({ t, boxes: kept })
    for (const box of kept) addToFlags(flags, box, t, makeId)
  }

  for (let t = 0; t < duration; t += step) {
    if (isCancelled()) return null
    const seeked = waitFor(video, 'seeked')
    video.currentTime = t
    await seeked

    const boxes = await detect(video, video.videoWidth, video.videoHeight, canvas, minConf)
    // Snapshot now, while this frame is on screen; the box may only be confirmed later.
    checked.push({ t, boxes: boxes.map((box) => ({ ...box, image: snapshot(video, box) })) })
    if (checked.length > 1) finish(checked.length - 2)
    report(Math.min(1, (t + step) / duration))
  }
  if (checked.length > 0) finish(checked.length - 1)
  report(1)
  video.removeAttribute('src')
  return { step, timeline, flags }
}

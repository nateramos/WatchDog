import * as ort from 'onnxruntime-web'
import { containment, decode, nms } from './boxes.js'

// Same classes and threshold as tracking/track.py (WEAPON_NAMES, WEAPON_CONF).
export const CLASS_NAMES = ['gun', 'knife']
// The model also knows knives, but for now WatchDog flags firearms only.
const FLAGGED = ['gun']
export const FLAG_CONF = 0.4

const SIZE = 640 // the model was trained and exported at 640x640
const SURE_CONF = 0.7 // above this, skip the extra turned-frame check
const SAME_OBJECT = 0.5 // turned-frame boxes this much inside an upright box are the same object
const MODEL_URL = '/models/weapons.onnx'

// Single-threaded so the site does not need special cross-origin headers.
ort.env.wasm.numThreads = 1

let sessionPromise = null

export function loadModel() {
  sessionPromise ??= ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] })
  return sessionPromise
}

// Fit the frame inside a 640x640 square (grey padding at the right/bottom), as YOLO expects.
// With `rotated`, the frame is first turned 90 degrees clockwise.
function letterbox(source, width, height, canvas, rotated) {
  const scale = SIZE / Math.max(width, height)
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = 'rgb(114,114,114)'
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.save()
  ctx.scale(scale, scale)
  if (rotated) {
    ctx.translate(height, 0)
    ctx.rotate(Math.PI / 2)
  }
  ctx.drawImage(source, 0, 0, width, height)
  ctx.restore()

  const { data } = ctx.getImageData(0, 0, SIZE, SIZE)
  const area = SIZE * SIZE
  const input = new Float32Array(3 * area)
  for (let i = 0; i < area; i++) {
    input[i] = data[i * 4] / 255
    input[area + i] = data[i * 4 + 1] / 255
    input[2 * area + i] = data[i * 4 + 2] / 255
  }
  return { input, scale }
}

async function run(session, source, width, height, canvas, rotated, minConf) {
  const { input, scale } = letterbox(source, width, height, canvas, rotated)
  const tensor = new ort.Tensor('float32', input, [1, 3, SIZE, SIZE])
  const results = await session.run({ [session.inputNames[0]]: tensor })
  const boxes = decode(results[session.outputNames[0]], scale, minConf, CLASS_NAMES)
  return boxes.filter((b) => FLAGGED.includes(b.label))
}

// Run the detector on whatever is currently drawn in `source` (a video at a given time).
// The model was trained mostly on guns held sideways and is less sure of upright ones, so
// frames it is unsure about are also checked turned 90 degrees, keeping the more confident box.
export async function detect(source, width, height, canvas, minConf = FLAG_CONF) {
  const session = await loadModel()
  const upright = await run(session, source, width, height, canvas, false, minConf)
  if (upright.some((b) => b.confidence >= SURE_CONF)) return upright

  const turned = await run(session, source, width, height, canvas, true, minConf)
  // A box found in the turned frame, mapped back to the original frame.
  const back = turned.map((b) => ({ ...b, x: b.y, y: height - (b.x + b.w), w: b.h, h: b.w }))
  return nms([...upright, ...back], (a, b) => containment(a, b) >= SAME_OBJECT)
}

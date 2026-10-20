// Box math shared by the detector and the video overlay. Boxes are { x, y, w, h, label,
// confidence } in video pixels. Nothing here touches the browser, so it is easy to test.

const NMS_IOU = 0.45

// Overlap of two boxes as a share of their combined area (0 = apart, 1 = identical).
export function iou(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  return (x * y) / (a.w * a.h + b.w * b.h - x * y)
}

// Share of the smaller box that lies inside the other one.
export function containment(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  return (x * y) / Math.min(a.w * a.h, b.w * b.h)
}

// Keep the most confident box among overlapping boxes of the same kind.
export function nms(boxes, overlaps = (a, b) => iou(a, b) >= NMS_IOU) {
  const sorted = [...boxes].sort((a, b) => b.confidence - a.confidence)
  const kept = []
  for (const box of sorted) {
    if (kept.every((k) => k.label !== box.label || !overlaps(k, box))) kept.push(box)
  }
  return kept
}

// YOLO output is (1, 4 + classes, N): box centre/size in model space, then one score per
// class. `scale` is model size / video size, used to map boxes back to video pixels.
export function decode(output, scale, minConf, names) {
  const n = output.dims[2]
  const d = output.data
  const boxes = []
  for (let i = 0; i < n; i++) {
    let best = 0
    let cls = 0
    for (let c = 0; c < names.length; c++) {
      const score = d[(4 + c) * n + i]
      if (score > best) {
        best = score
        cls = c
      }
    }
    if (best < minConf) continue
    const w = d[2 * n + i] / scale
    const h = d[3 * n + i] / scale
    boxes.push({
      x: d[i] / scale - w / 2,
      y: d[n + i] / scale - h / 2,
      w,
      h,
      label: names[cls],
      confidence: best,
    })
  }
  return nms(boxes)
}

const lerp = (a, b, f) => a + (b - a) * f

// Boxes to show at `time`, sliding each box between the two checked frames around it
// so the overlay moves smoothly even though only ~2 frames per second were checked.
export function boxesAt(timeline, time, step) {
  const i = timeline.findLastIndex((s) => s.t <= time)
  if (i < 0) return []
  const before = timeline[i]
  const after = timeline[i + 1]
  if (!after || after.t - before.t > step * 1.5) {
    return time - before.t <= step ? before.boxes : []
  }
  const f = (time - before.t) / (after.t - before.t)
  return before.boxes.flatMap((a) => {
    const match = after.boxes
      .filter((b) => b.label === a.label)
      .sort((p, q) => iou(a, q) - iou(a, p))[0]
    if (!match || iou(a, match) < 0.05) return f < 0.5 ? [a] : []
    return [{
      label: a.label,
      x: lerp(a.x, match.x, f),
      y: lerp(a.y, match.y, f),
      w: lerp(a.w, match.w, f),
      h: lerp(a.h, match.h, f),
      confidence: f < 0.5 ? a.confidence : match.confidence,
    }]
  }).concat(
    // Boxes that first appear in the later frame show up halfway between the two.
    f >= 0.5
      ? after.boxes.filter((b) => !before.boxes.some((a) => a.label === b.label && iou(a, b) >= 0.05))
      : [],
  )
}

const MERGE_GAP = 1.5 // flags of the same kind closer than this are one event

// Add a confirmed box at time `t` to the list of flags. Boxes of the same kind less than
// MERGE_GAP seconds after the last one belong to the same event, which keeps its most
// confident frame.
export function addToFlags(flags, box, t, makeId) {
  const last = flags.findLast((f) => f.label === box.label)
  if (last && t - last.lastTime <= MERGE_GAP) {
    last.lastTime = t
    if (box.confidence > last.confidence) {
      Object.assign(last, { time: t, confidence: box.confidence, image: box.image })
    }
    return
  }
  flags.push({
    id: makeId(),
    label: box.label,
    confidence: box.confidence,
    time: t,
    lastTime: t,
    image: box.image,
    decision: 'pending',
  })
}


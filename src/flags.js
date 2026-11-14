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

// Fold a camera's latest flags into the alert list. Flags already there are updated in
// place (a scan can raise a flag's confidence as it goes) but keep the reviewer's decision.
export function mergeAlerts(alerts, flags, camera) {
  const byId = new Map(alerts.map((a) => [a.id, a]))
  const added = []
  for (const f of flags) {
    const old = byId.get(f.id)
    const alert = {
      ...f,
      cameraId: camera.id,
      camera: camera.name,
      clip: camera.fileName,
      raisedAt: old?.raisedAt ?? new Date().toISOString(),
      decision: old?.decision ?? 'pending',
      reviewer: old?.reviewer ?? '',
      decidedAt: old?.decidedAt ?? '',
    }
    if (old) byId.set(f.id, alert)
    else added.push(alert)
  }
  // Newest alerts first.
  return [...added.reverse(), ...alerts.map((a) => byId.get(a.id))]
}

// The review-log row for an alert. The log is saved in the browser, so it leaves out the
// snapshot image.
export function logRow(alert) {
  return {
    id: alert.id,
    loggedAt: alert.raisedAt,
    camera: alert.camera,
    clip: alert.clip,
    videoTime: alert.time,
    label: alert.label,
    confidence: alert.confidence,
    decision: alert.decision,
    reviewer: alert.reviewer,
    decidedAt: alert.decidedAt,
  }
}

// Put the latest version of each row into the log: new rows go on top, rows already
// there are replaced where they are.
export function upsertRows(log, rows) {
  const fresh = new Map(rows.map((r) => [r.id, r]))
  const kept = log.map((r) => fresh.get(r.id) ?? r)
  const known = new Set(log.map((r) => r.id))
  return [...rows.filter((r) => !known.has(r.id)), ...kept]
}


// Formatting for the review log: video times and the CSV export.

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = (seconds % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
}

// How the log words what was detected and what the reviewer decided. WatchDog never knows
// there is a gun, only that there may be one; the reviewer's decision says whether it was a
// real threat.
export const detectedText = (label) => `possible ${label}`
const DECISIONS = { pending: 'awaiting review', confirmed: 'threat confirmed', dismissed: 'false alarm' }
export const decisionText = (decision) => DECISIONS[decision] ?? decision

const CSV_HEADER = ['logged_at', 'camera', 'clip', 'video_time', 'detected', 'confidence', 'decision', 'reviewer', 'decided_at']

export function toCsv(rows) {
  const quote = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = rows.map((r) =>
    [r.loggedAt, r.camera, r.clip, formatTime(r.videoTime), detectedText(r.label), r.confidence.toFixed(2), decisionText(r.decision), r.reviewer, r.decidedAt]
      .map(quote)
      .join(','),
  )
  return [CSV_HEADER.join(','), ...lines].join('\n')
}

export function downloadCsv(rows) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'watchdog-review-log.csv'
  link.click()
  URL.revokeObjectURL(link.href)
}

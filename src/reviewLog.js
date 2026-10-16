// Formatting for the review log: video times and the CSV export.

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = (seconds % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
}

const CSV_HEADER = ['logged_at', 'clip', 'video_time', 'object', 'confidence', 'decision', 'reviewer', 'decided_at']

export function toCsv(rows) {
  const quote = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = rows.map((r) =>
    [r.loggedAt, r.clip, formatTime(r.videoTime), r.label, r.confidence.toFixed(2), r.decision, r.reviewer, r.decidedAt]
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

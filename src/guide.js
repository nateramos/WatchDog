// The demo guide's steps (see Guide.jsx). Which step a visitor is on comes only from what
// the app already knows, so the guide can never fall out of step with the demo:
// 1 the demo hasn't started, 2 it is playing but nothing has been flagged yet,
// 3 an alert is waiting and the visitor is not on the Alerts page, 4 they are on Alerts
// with an alert still to decide, 5 every alert from this run is decided but they haven't
// opened the Review log since, 6 they have: the guide is finished.
export const STEPS = ['Start the demo', 'Watch Camera 1', 'Open the alert', 'Confirm or dismiss', 'Check the Review log']
export const FINISHED = STEPS.length + 1

// `run` is the demo run's id (0 before the first Start demo). Demo alert ids contain it.
// `logRun` is the run whose Review log the visitor opened after deciding every alert.
export function guideStep({ run, alerts, onAlerts, logRun = 0 }) {
  if (!run) return 1
  const mine = alerts.filter((a) => a.demo && a.id.includes(`-${run}-`))
  if (mine.length === 0) return 2
  if (mine.every((a) => a.decision !== 'pending')) return logRun === run ? FINISHED : 5
  return onAlerts ? 4 : 3
}

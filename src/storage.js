// localStorage that never throws: private windows can block it, and the page should still
// work for that visit.

export function readStored(key, fallback) {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : JSON.parse(value)
  } catch {
    return fallback
  }
}

export const LOG_KEY = 'watchdog-review-log'
export const REVIEWER_KEY = 'watchdog-reviewer'

// The judges' demo account starts every visit from the same place: no review log and no
// reviewer name left over from an earlier visit in this browser.
export function resetDemoData(storage = globalThis.localStorage) {
  try {
    storage.removeItem(LOG_KEY)
    storage.removeItem(REVIEWER_KEY)
  } catch {
    // Storage blocked: there is nothing saved to clear.
  }
}

export function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Nothing to do; the value just won't survive a reload.
  }
}

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

export function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Nothing to do; the value just won't survive a reload.
  }
}

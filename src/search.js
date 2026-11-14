// Searching and filtering the camera wall. A camera is { name, status, area, floor, wing };
// status is 'live' or 'offline', and the place fields may be missing.

// Every word typed must appear somewhere in the camera's name or place, ignoring case, so
// "lobby", "2", "cam 2" and "floor 1" all work. An empty search matches every camera.
export function cameraMatches(camera, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const text = [camera.name, camera.area, camera.floor, camera.wing].filter(Boolean).join(' ').toLowerCase()
  return words.every((word) => text.includes(word))
}

export const FILTER_FIELDS = ['status', 'area', 'floor', 'wing']
export const NO_FILTERS = { status: '', area: '', floor: '', wing: '' }

// A camera passes when it matches the search and every filter that is set ('' = any).
export function passes(camera, query, filters) {
  return cameraMatches(camera, query) && FILTER_FIELDS.every((f) => !filters[f] || camera[f] === filters[f])
}

// The choices each filter offers: the values the cameras actually have, in first-seen order.
export function filterOptions(cameras) {
  const options = {}
  for (const field of FILTER_FIELDS) {
    options[field] = [...new Set(cameras.map((c) => c[field]).filter(Boolean))]
  }
  return options
}

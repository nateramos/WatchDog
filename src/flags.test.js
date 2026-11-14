import { describe, expect, it } from 'vitest'
import { addToFlags, logRow, mergeAlerts, sightings, upsertRows } from './flags.js'

const gun = (confidence, image = 'img') => ({ label: 'gun', confidence, image })
const ids = () => {
  let n = 0
  return () => `f${n++}`
}

describe('addToFlags', () => {
  it('treats a gun seen again within 1.5 s as the same event, keeping its most confident frame', () => {
    const flags = []
    const makeId = ids()
    addToFlags(flags, gun(0.5, 'a'), 1.0, makeId)
    addToFlags(flags, gun(0.8, 'b'), 1.5, makeId)
    addToFlags(flags, gun(0.6, 'c'), 2.5, makeId)
    expect(flags).toHaveLength(1)
    expect(flags[0]).toMatchObject({ id: 'f0', confidence: 0.8, time: 1.5, image: 'b', lastTime: 2.5 })
  })

  it('starts a new event after a longer gap', () => {
    const flags = []
    const makeId = ids()
    addToFlags(flags, gun(0.5), 1.0, makeId)
    addToFlags(flags, gun(0.5), 3.0, makeId)
    expect(flags.map((f) => f.id)).toEqual(['f0', 'f1'])
  })
})

describe('mergeAlerts', () => {
  const camera = { id: 'cam-1', name: 'Main entrance', fileName: 'hall.mp4' }
  const flag = (id, confidence) => ({ id, label: 'gun', confidence, time: 2, image: 'img', decision: 'pending' })

  it('adds new flags as pending alerts, newest first, tagged with the camera', () => {
    const alerts = mergeAlerts([], [flag('a', 0.5), flag('b', 0.6)], camera)
    expect(alerts.map((a) => a.id)).toEqual(['b', 'a'])
    expect(alerts[0]).toMatchObject({ camera: 'Main entrance', cameraId: 'cam-1', clip: 'hall.mp4', decision: 'pending' })
  })

  it("updates an alert's confidence without losing the reviewer's decision", () => {
    const [first] = mergeAlerts([], [flag('a', 0.5)], camera)
    const reviewed = { ...first, decision: 'dismissed', reviewer: 'Judge', decidedAt: 'then' }
    const [after] = mergeAlerts([reviewed], [flag('a', 0.9)], camera)
    expect(after).toMatchObject({ confidence: 0.9, decision: 'dismissed', reviewer: 'Judge', raisedAt: first.raisedAt })
  })
})

describe('upsertRows', () => {
  it('puts new rows on top and replaces changed rows in place', () => {
    const log = [{ id: 'old', decision: 'pending' }, { id: 'older', decision: 'confirmed' }]
    const next = upsertRows(log, [{ id: 'new' }, { id: 'old', decision: 'dismissed' }])
    expect(next).toEqual([{ id: 'new' }, { id: 'old', decision: 'dismissed' }, { id: 'older', decision: 'confirmed' }])
  })
})

describe('logRow', () => {
  it('leaves the snapshot image out of the saved log', () => {
    const [alert] = mergeAlerts([], [{ id: 'a', label: 'gun', confidence: 0.7, time: 3, image: 'data:...' }], {
      id: 'c',
      name: 'Gym',
      fileName: 'gym.mp4',
    })
    const row = logRow(alert)
    expect(row).not.toHaveProperty('image')
    expect(row).toMatchObject({ camera: 'Gym', clip: 'gym.mp4', videoTime: 3, decision: 'pending' })
  })
})

describe('sightings', () => {
  const frame = (t, ...confidences) => ({ t, boxes: confidences.map((confidence) => ({ label: 'gun', confidence })) })

  it('starts a sighting at the first frame with a gun and splits on gaps over 1.5 s', () => {
    const timeline = [frame(0), frame(0.5, 0.4, 0.6), frame(1, 0.9), frame(1.5), frame(2, 0.5), frame(4, 0.7)]
    const found = sightings(timeline)
    expect(found.map((s) => [s.start, s.end])).toEqual([[0.5, 2], [4, 4]])
    expect(found[0].box.confidence).toBe(0.6) // the most confident box in the first frame
  })
})

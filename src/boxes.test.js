import { describe, expect, it } from 'vitest'
import { boxesAt, containment, decode, iou, nms } from './boxes.js'

const box = (x, y, w, h, extra = {}) => ({ x, y, w, h, label: 'gun', confidence: 0.5, ...extra })

describe('iou', () => {
  it('is 1 for identical boxes and 0 for boxes that do not touch', () => {
    expect(iou(box(0, 0, 10, 10), box(0, 0, 10, 10))).toBe(1)
    expect(iou(box(0, 0, 10, 10), box(20, 20, 10, 10))).toBe(0)
  })

  it('measures partial overlap against the combined area', () => {
    // 5x10 overlap = 50; combined area 100 + 100 - 50 = 150.
    expect(iou(box(0, 0, 10, 10), box(5, 0, 10, 10))).toBeCloseTo(50 / 150)
  })
})

describe('containment', () => {
  it('is 1 when the smaller box is fully inside the bigger one', () => {
    expect(containment(box(0, 0, 100, 100), box(10, 10, 20, 20))).toBe(1)
  })
})

describe('nms', () => {
  it('keeps the most confident of overlapping boxes of the same kind', () => {
    const kept = nms([box(0, 0, 10, 10, { confidence: 0.6 }), box(1, 0, 10, 10, { confidence: 0.9 })])
    expect(kept).toHaveLength(1)
    expect(kept[0].confidence).toBe(0.9)
  })

  it('keeps overlapping boxes of different kinds', () => {
    expect(nms([box(0, 0, 10, 10), box(0, 0, 10, 10, { label: 'knife' })])).toHaveLength(2)
  })

  it('does not reorder the array it was given', () => {
    const input = [box(0, 0, 10, 10, { confidence: 0.2 }), box(50, 50, 10, 10, { confidence: 0.9 })]
    nms(input)
    expect(input[0].confidence).toBe(0.2)
  })
})

describe('decode', () => {
  // Fake YOLO output with 2 candidates: rows are cx, cy, w, h, gun score, knife score.
  const output = {
    dims: [1, 6, 2],
    data: Float32Array.from([
      100, 300, // cx
      200, 300, // cy
      40, 20, // w
      60, 20, // h
      0.8, 0.1, // gun
      0.1, 0.2, // knife
    ]),
  }

  it('turns confident candidates into boxes in video pixels', () => {
    // scale 0.5 = the model saw the video at half size, so boxes double.
    const [found, ...rest] = decode(output, 0.5, 0.4, ['gun', 'knife'])
    expect(rest).toHaveLength(0)
    expect(found).toMatchObject({ label: 'gun', x: 160, y: 340, w: 80, h: 120 })
    expect(found.confidence).toBeCloseTo(0.8)
  })

  it('drops candidates below the confidence threshold', () => {
    expect(decode(output, 1, 0.9, ['gun', 'knife'])).toHaveLength(0)
  })
})

describe('boxesAt', () => {
  const timeline = [
    { t: 0, boxes: [box(0, 0, 10, 10, { confidence: 0.6 })] },
    { t: 1, boxes: [box(4, 0, 10, 10, { confidence: 0.8 })] },
  ]

  it('slides a box between two checked frames', () => {
    const [mid] = boxesAt(timeline, 0.5, 1)
    expect(mid.x).toBeCloseTo(2)
  })

  it('shows nothing before the first checked frame', () => {
    expect(boxesAt(timeline, -1, 1)).toEqual([])
  })

  it('stops showing a box a step after the last checked frame', () => {
    expect(boxesAt(timeline, 1.5, 1)).toHaveLength(1)
    expect(boxesAt(timeline, 2.5, 1)).toEqual([])
  })
})

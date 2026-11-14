import { describe, expect, it } from 'vitest'
import { addToFlags } from './flags.js'

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

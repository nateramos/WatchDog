import { describe, expect, it } from 'vitest'
import { LOG_KEY, REVIEWER_KEY, resetDemoData } from './storage.js'

function fakeStorage(items) {
  const data = new Map(Object.entries(items))
  return {
    removeItem: (key) => data.delete(key),
    has: (key) => data.has(key),
  }
}

describe('resetDemoData', () => {
  it('clears the review log and reviewer name, and nothing else', () => {
    const storage = fakeStorage({ [LOG_KEY]: '[1]', [REVIEWER_KEY]: '"Judge"', other: 'kept' })
    resetDemoData(storage)
    expect(storage.has(LOG_KEY)).toBe(false)
    expect(storage.has(REVIEWER_KEY)).toBe(false)
    expect(storage.has('other')).toBe(true)
  })

  it('does not throw when storage is blocked', () => {
    const blocked = { removeItem: () => { throw new Error('blocked') } }
    expect(() => resetDemoData(blocked)).not.toThrow()
  })
})

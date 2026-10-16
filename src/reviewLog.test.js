import { describe, expect, it } from 'vitest'
import { formatTime, toCsv } from './reviewLog.js'

describe('formatTime', () => {
  it('shows minutes and seconds to a tenth', () => {
    expect(formatTime(5.5)).toBe('0:05.5')
    expect(formatTime(75.25)).toBe('1:15.3')
  })
})

describe('toCsv', () => {
  const row = {
    loggedAt: '2026-10-16T22:00:00.000Z',
    clip: 'Pexels stock clip #4006667',
    videoTime: 5.5,
    label: 'gun',
    confidence: 0.857,
    decision: 'confirmed',
    reviewer: 'Nate',
    decidedAt: '2026-10-16T22:01:00.000Z',
  }

  it('writes a header row and one line per log entry', () => {
    const lines = toCsv([row]).split('\n')
    expect(lines[0]).toBe('logged_at,clip,video_time,object,confidence,decision,reviewer,decided_at')
    expect(lines[1]).toBe(
      '"2026-10-16T22:00:00.000Z","Pexels stock clip #4006667","0:05.5","gun","0.86","confirmed","Nate","2026-10-16T22:01:00.000Z"',
    )
  })

  it('escapes quotes so a reviewer name cannot break the file', () => {
    expect(toCsv([{ ...row, reviewer: 'Nate "N" Ramos' }])).toContain('"Nate ""N"" Ramos"')
  })

  it('leaves empty fields blank for pending rows', () => {
    expect(toCsv([{ ...row, decision: 'pending', reviewer: '', decidedAt: '' }])).toMatch(/"pending","",""$/)
  })
})

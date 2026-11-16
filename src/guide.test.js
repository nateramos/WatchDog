import { describe, expect, it } from 'vitest'
import { FINISHED, guideStep } from './guide.js'

const alert = (run, decision = 'pending') => ({ id: `demo-hallway-${run}-0`, demo: true, decision })

describe('guideStep', () => {
  it('asks to start the demo before the first run', () => {
    expect(guideStep({ run: 0, alerts: [], onAlerts: false })).toBe(1)
    expect(guideStep({ run: 0, alerts: [], onAlerts: true })).toBe(1)
  })

  it('says to watch Camera 1 until this run raises an alert', () => {
    expect(guideStep({ run: 200, alerts: [], onAlerts: false })).toBe(2)
  })

  it('ignores alerts left over from an earlier run', () => {
    expect(guideStep({ run: 200, alerts: [alert(100, 'confirmed')], onAlerts: false })).toBe(2)
  })

  it('points to the alert, then to the decision once on the Alerts page', () => {
    expect(guideStep({ run: 200, alerts: [alert(200)], onAlerts: false })).toBe(3)
    expect(guideStep({ run: 200, alerts: [alert(200)], onAlerts: true })).toBe(4)
  })

  it('points to the Review log once every alert from this run is confirmed or dismissed', () => {
    expect(guideStep({ run: 200, alerts: [alert(200, 'dismissed')], onAlerts: true })).toBe(5)
    expect(guideStep({ run: 200, alerts: [alert(200, 'confirmed')], onAlerts: false })).toBe(5)
  })

  it('is finished once the Review log was opened for this run, not an earlier one', () => {
    const decided = [alert(200, 'confirmed')]
    expect(guideStep({ run: 200, alerts: decided, onAlerts: true, logRun: 200 })).toBe(FINISHED)
    expect(guideStep({ run: 200, alerts: decided, onAlerts: true, logRun: 100 })).toBe(5)
  })

  it('is not done while another alert from this run still needs review', () => {
    const second = { ...alert(200), id: 'demo-hallway-200-1' }
    expect(guideStep({ run: 200, alerts: [second, alert(200, 'dismissed')], onAlerts: true })).toBe(4)
  })
})

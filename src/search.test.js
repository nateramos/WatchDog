import { describe, expect, it } from 'vitest'
import { NO_FILTERS, cameraMatches, filterOptions, passes } from './search.js'

const lobby = { name: 'Camera 2 · Main lobby', status: 'live', area: 'Lobby', floor: 'Floor 1', wing: 'Center' }
const gym = { name: 'Camera 4 · Gym', status: 'offline', area: 'Gym', floor: 'Floor 1', wing: 'East wing' }
const upstairs = { name: 'Camera 3 · East hallway', status: 'offline', area: 'Hallway', floor: 'Floor 2', wing: 'East wing' }

describe('cameraMatches', () => {
  it('finds a camera by name, number or place, ignoring case', () => {
    expect(cameraMatches(lobby, 'LOBBY')).toBe(true)
    expect(cameraMatches(lobby, 'cam 2')).toBe(true)
    expect(cameraMatches(lobby, 'floor 1')).toBe(true)
    expect(cameraMatches(gym, 'east')).toBe(true)
  })

  it('needs every word to match, and matches everything when empty', () => {
    expect(cameraMatches(lobby, 'lobby 3')).toBe(false)
    expect(cameraMatches(lobby, '   ')).toBe(true)
  })
})

describe('passes', () => {
  it('applies every filter that is set, together with the search', () => {
    const cams = [lobby, gym, upstairs]
    const pick = (query, filters) => cams.filter((c) => passes(c, query, { ...NO_FILTERS, ...filters })).map((c) => c.name)
    expect(pick('', {})).toHaveLength(3)
    expect(pick('', { status: 'offline' })).toEqual([gym.name, upstairs.name])
    expect(pick('', { status: 'offline', floor: 'Floor 1' })).toEqual([gym.name])
    expect(pick('hallway', { wing: 'East wing' })).toEqual([upstairs.name])
    expect(pick('', { area: 'Lobby', status: 'offline' })).toEqual([])
  })
})

describe('filterOptions', () => {
  it('offers only the values the cameras have, once each', () => {
    const options = filterOptions([lobby, gym, upstairs, { name: 'Camera 5', status: 'live' }])
    expect(options.status).toEqual(['live', 'offline'])
    expect(options.floor).toEqual(['Floor 1', 'Floor 2'])
    expect(options.wing).toEqual(['Center', 'East wing'])
  })
})

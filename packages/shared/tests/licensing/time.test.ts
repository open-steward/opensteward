import { describe, expect, it } from 'vitest'
import {
  DAY_MS,
  EXPIRING_WINDOW_MS as W,
  GRACE_PERIOD_MS as G,
  ROLLBACK_TOLERANCE_MS as R,
  classifyTime,
  computeClock,
} from '../../src/licensing/time'

const E = Date.parse('2027-10-06T17:00:00.000Z')

describe('classifyTime', () => {
  it('[L7:V11] exactly exp−30d is EXPIRING; 1 ms earlier is VALID', () => {
    expect(classifyTime(E, E - W)).toBe('EXPIRING')
    expect(classifyTime(E, E - W - 1)).toBe('VALID')
  })
  it('[L7:V12] exactly exp is GRACE; 1 ms earlier is EXPIRING', () => {
    expect(classifyTime(E, E)).toBe('GRACE')
    expect(classifyTime(E, E - 1)).toBe('EXPIRING')
  })
  it('[L7:V13] exactly exp+30d is DEGRADED; 1 ms earlier is GRACE', () => {
    expect(classifyTime(E, E + G)).toBe('DEGRADED')
    expect(classifyTime(E, E + G - 1)).toBe('GRACE')
  })
  it('the windows are 30 days and the rollback tolerance 24 h, defined once', () => {
    expect([W, G, R, DAY_MS]).toEqual([2_592_000_000, 2_592_000_000, 86_400_000, 86_400_000])
  })
})

describe('computeClock', () => {
  it('the first observation is the system time', () => {
    expect(computeClock(E, null)).toEqual({
      effectiveNowMs: E,
      maxSeenAtMs: E,
      rollbackDetected: false,
    })
  })
  it('a rollback of exactly 24 h is believed', () => {
    expect(computeClock(E - R, E)).toEqual({
      effectiveNowMs: E - R,
      maxSeenAtMs: E,
      rollbackDetected: false,
    })
  })
  it('beyond 24 h it is flagged and clamped to max_seen_at − 24 h', () => {
    expect(computeClock(E - R - 1, E)).toEqual({
      effectiveNowMs: E - R,
      maxSeenAtMs: E,
      rollbackDetected: true,
    })
  })
  it('forward time moves max_seen_at', () => {
    expect(computeClock(E + 5, E)).toEqual({
      effectiveNowMs: E + 5,
      maxSeenAtMs: E + 5,
      rollbackDetected: false,
    })
  })
})

/**
 * `peek()` answers "would a request be refused right now?" without taking the
 * half-open probe. `isOpen()` cannot be used for a look-ahead: in half-open it
 * grants the single probe to whoever asks, so a caller that asks and then does
 * not make the request leaves the probe claimed forever (see
 * `data-store/sync-worker-breaker-recovery.test.ts`).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { CircuitBreaker } from '../src/circuit-breaker'

describe('CircuitBreaker.peek', () => {
  afterEach(() => vi.useRealTimers())

  it('is false while closed', () => {
    const cb = new CircuitBreaker(2, 1000)
    expect(cb.peek('k')).toBe(false)
  })

  it('is true while open and inside the cooldown', () => {
    vi.useFakeTimers()
    const cb = new CircuitBreaker(2, 1000)
    cb.recordFailure('k')
    cb.recordFailure('k')
    expect(cb.peek('k')).toBe(true)
    vi.advanceTimersByTime(999)
    expect(cb.peek('k')).toBe(true)
  })

  it('is false after the cooldown and leaves the probe for isOpen to grant exactly once', () => {
    vi.useFakeTimers()
    const cb = new CircuitBreaker(2, 1000)
    cb.recordFailure('k')
    cb.recordFailure('k')
    vi.advanceTimersByTime(1000)
    expect(cb.peek('k')).toBe(false)
    expect(cb.peek('k')).toBe(false) // still not claimed
    expect(cb.isOpen('k')).toBe(false) // the probe, granted here
    expect(cb.isOpen('k')).toBe(true) // and no second one
    expect(cb.peek('k')).toBe(true) // probe in flight: a look-ahead says wait
    cb.recordSuccess('k')
    expect(cb.peek('k')).toBe(false)
  })
})

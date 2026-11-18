import { describe, it, expect, vi, afterEach } from 'vitest'
import { CircuitBreaker, isCircuitBreakerError } from '../src/circuit-breaker'

describe('CircuitBreaker', () => {
  afterEach(() => vi.useRealTimers())

  it('starts closed', () => {
    const cb = new CircuitBreaker()
    expect(cb.isOpen('test')).toBe(false)
  })

  it('stays closed below failure threshold', () => {
    const cb = new CircuitBreaker(3)
    cb.recordFailure('test')
    cb.recordFailure('test')
    expect(cb.isOpen('test')).toBe(false)
  })

  it('opens after reaching failure threshold', () => {
    const cb = new CircuitBreaker(3)
    cb.recordFailure('test')
    cb.recordFailure('test')
    cb.recordFailure('test')
    expect(cb.isOpen('test')).toBe(true)
  })

  it('resets on success', () => {
    const cb = new CircuitBreaker(3)
    cb.recordFailure('test')
    cb.recordFailure('test')
    cb.recordSuccess('test')
    cb.recordFailure('test')
    cb.recordFailure('test')
    // Only 2 failures since last success — still closed
    expect(cb.isOpen('test')).toBe(false)
  })

  it('transitions to half-open after cooldown', () => {
    vi.useFakeTimers()
    const cb = new CircuitBreaker(2, 1000)
    cb.recordFailure('test')
    cb.recordFailure('test')
    expect(cb.isOpen('test')).toBe(true)

    vi.advanceTimersByTime(1001)
    // After cooldown, first call allowed (half-open probe)
    expect(cb.isOpen('test')).toBe(false)
    // Second concurrent call blocked while probe is in flight
    expect(cb.isOpen('test')).toBe(true)
  })

  it('closes after successful probe in half-open', () => {
    vi.useFakeTimers()
    const cb = new CircuitBreaker(2, 1000)
    cb.recordFailure('test')
    cb.recordFailure('test')
    vi.advanceTimersByTime(1001)
    cb.isOpen('test') // allow probe
    cb.recordSuccess('test')
    expect(cb.isOpen('test')).toBe(false)
  })

  it('re-opens after failed probe in half-open', () => {
    vi.useFakeTimers()
    const cb = new CircuitBreaker(2, 1000)
    cb.recordFailure('test')
    cb.recordFailure('test')
    vi.advanceTimersByTime(1001)
    cb.isOpen('test') // allow probe
    cb.recordFailure('test')
    expect(cb.isOpen('test')).toBe(true)
  })

  it('isolates keys from each other', () => {
    const cb = new CircuitBreaker(2)
    cb.recordFailure('a')
    cb.recordFailure('a')
    expect(cb.isOpen('a')).toBe(true)
    expect(cb.isOpen('b')).toBe(false)
  })

  it('throwOpen creates a proper error', () => {
    try {
      CircuitBreaker.throwOpen('fedex')
    } catch (err) {
      expect(isCircuitBreakerError(err)).toBe(true)
      expect((err as Error).message).toContain('fedex')
      return
    }
    expect.fail('Expected throwOpen to throw')
  })
})

describe('isCircuitBreakerError', () => {
  it('returns false for normal errors', () => {
    expect(isCircuitBreakerError(new Error('oops'))).toBe(false)
  })

  it('returns false for non-error values', () => {
    expect(isCircuitBreakerError(null)).toBe(false)
    expect(isCircuitBreakerError('string')).toBe(false)
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LoginLockout } from '../../src/core/auth/lockout'

describe('LoginLockout', () => {
  let lockout: LoginLockout
  let events: Array<{ username: string; kind: 'temporary' | 'permanent'; failures: number }>

  beforeEach(() => {
    events = []
    lockout = new LoginLockout({
      config: { windowMs: 1000, thresholdShort: 5, thresholdHard: 10, lockoutMs: 5000 },
      onLockout: (e) => events.push(e),
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns null before threshold is hit', () => {
    expect(lockout.check('alice', 0)).toBeNull()
    for (let i = 0; i < 4; i++) lockout.recordFailure('alice', i * 100)
    expect(lockout.check('alice', 500)).toBeNull()
    expect(events).toHaveLength(0)
  })

  it('temporary-locks after thresholdShort failures in window', () => {
    for (let i = 0; i < 5; i++) lockout.recordFailure('alice', i * 100)
    const decision = lockout.check('alice', 500)
    expect(decision).not.toBeNull()
    expect(decision!.kind).toBe('temporary')
    expect(decision!.retryAfterMs).toBeGreaterThan(0)
    expect(events).toEqual([{ username: 'alice', kind: 'temporary', failures: 5 }])
  })

  it('hard-locks after thresholdHard cumulative failures', () => {
    for (let i = 0; i < 10; i++) lockout.recordFailure('alice', i * 100)
    const decision = lockout.check('alice', 1500)
    expect(decision).not.toBeNull()
    expect(decision!.kind).toBe('permanent')
    expect(events.some((e) => e.kind === 'permanent')).toBe(true)
  })

  it('lifts temporary lockout after lockoutMs elapses', () => {
    for (let i = 0; i < 5; i++) lockout.recordFailure('alice', i * 100)
    expect(lockout.check('alice', 500)).not.toBeNull()
    expect(lockout.check('alice', 500 + 5001)).toBeNull()
  })

  it('recordSuccess clears state', () => {
    for (let i = 0; i < 5; i++) lockout.recordFailure('alice', i * 100)
    expect(lockout.check('alice', 500)).not.toBeNull()
    lockout.recordSuccess('alice')
    expect(lockout.check('alice', 500)).toBeNull()
  })

  it('manualUnlock clears a hard lock', () => {
    for (let i = 0; i < 10; i++) lockout.recordFailure('alice', i * 100)
    expect(lockout.check('alice', 1500)?.kind).toBe('permanent')
    lockout.manualUnlock('alice')
    expect(lockout.check('alice', 1500)).toBeNull()
  })

  it('isolates per-username — locking alice does not affect bob', () => {
    for (let i = 0; i < 5; i++) lockout.recordFailure('alice', i * 100)
    expect(lockout.check('alice', 500)).not.toBeNull()
    expect(lockout.check('bob', 500)).toBeNull()
  })

  it('prunes failures outside the sliding window', () => {
    // 4 failures, then a 2-second gap, then 4 more.
    // First 4 fall out of the 1s window before any further fail.
    for (let i = 0; i < 4; i++) lockout.recordFailure('alice', i * 100)
    for (let i = 0; i < 4; i++) lockout.recordFailure('alice', 2500 + i * 100)
    expect(lockout.check('alice', 3000)).toBeNull() // only 4 in current window
  })

  // Production never passes an explicit `now` — the route calls
  // `check(username)` / `recordFailure(username)` and the class reads the
  // clock itself. These cover that path with an injected clock.
  describe('injected clock', () => {
    let clock: number
    let clocked: LoginLockout

    beforeEach(() => {
      clock = 1_700_000_000_000
      clocked = new LoginLockout({
        config: { windowMs: 1000, thresholdShort: 3, thresholdHard: 10, lockoutMs: 5000 },
        onLockout: (e) => events.push(e),
        now: () => clock,
      })
    })

    it('reads the injected clock instead of Date.now', () => {
      for (let i = 0; i < 3; i++) clocked.recordFailure('alice')
      expect(clocked.check('alice')?.kind).toBe('temporary')
      // Lock expires by the injected clock alone, with no real time elapsed.
      clock += 5001
      expect(clocked.check('alice')).toBeNull()
    })

    it('drops in-window failures once the window elapses', () => {
      clocked.recordFailure('alice')
      clock += 500
      clocked.recordFailure('alice')

      // Both failures are now older than windowMs, so the count restarts:
      // two more must not reach thresholdShort.
      clock += 1001
      clocked.recordFailure('alice')
      clocked.recordFailure('alice')
      expect(clocked.check('alice')).toBeNull()
      expect(events).toHaveLength(0)

      // A third inside the current window does reach it.
      clocked.recordFailure('alice')
      expect(clocked.check('alice')?.kind).toBe('temporary')
    })
  })

  it('OST_DISABLE_LOCKOUT=1 disables enforcement', () => {
    vi.stubEnv('OST_DISABLE_LOCKOUT', '1')
    for (let i = 0; i < 20; i++) lockout.recordFailure('alice', i * 100)
    expect(lockout.check('alice', 2000)).toBeNull()
    expect(events).toHaveLength(0)
  })
})

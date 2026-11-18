/**
 * Per-username login throttling.
 *
 * The global rate limiter on `/api/auth/login` (configured via Fastify's
 * @fastify/rate-limit) is per-IP. A distributed credential-stuffing
 * attack with thousands of IPs would not be slowed. This module adds a
 * second axis — per-username failure counting — so even a wide-IP attack
 * locks an account after enough wrong guesses.
 *
 * Defaults:
 *   - 10 failures in a 15-minute window → 1-hour lockout
 *   - 25 cumulative failures (across windows) → manual-unlock required
 *
 * State lives in process memory. A multi-replica deployment loses
 * accuracy on accounts probed across replicas; this is intentional for
 * Phase 1 — Phase 5 moves rate-limit state into Redis and will subsume
 * this. The single-replica behaviour still meaningfully raises the cost
 * of a brute force.
 *
 * Opt out via `OST_DISABLE_LOCKOUT=1` (intended for dev).
 */

export interface LockoutConfig {
  /** Sliding window length in ms. Default: 15 minutes. */
  windowMs: number
  /** Failures in window before temporary lockout fires. Default: 10. */
  thresholdShort: number
  /** Cumulative failures before permanent (manual-unlock) lockout. Default: 25. */
  thresholdHard: number
  /** Temporary lockout duration in ms. Default: 1 hour. */
  lockoutMs: number
}

export const DEFAULT_LOCKOUT_CONFIG: LockoutConfig = {
  windowMs: 15 * 60 * 1000,
  thresholdShort: 10,
  thresholdHard: 25,
  lockoutMs: 60 * 60 * 1000,
}

interface State {
  failures: number[]
  cumulative: number
  lockedUntil: number | null
  hardLocked: boolean
}

export interface LockoutDecision {
  /** ms until the caller may retry. Always present when locked. */
  retryAfterMs: number
  /** `'temporary'` lifts automatically; `'permanent'` requires admin action. */
  kind: 'temporary' | 'permanent'
}

export interface LockoutEvent {
  username: string
  kind: 'temporary' | 'permanent'
  failures: number
}

export class LoginLockout {
  private readonly state = new Map<string, State>()
  private readonly cfg: LockoutConfig
  private readonly onLockout: (event: LockoutEvent) => void
  private readonly now: () => number

  constructor(
    opts: {
      config?: Partial<LockoutConfig>
      onLockout?: (event: LockoutEvent) => void
      /**
       * Clock source. Every decision here is a comparison against a window or
       * a deadline, so tests need to move time without sleeping — and without
       * their result depending on how long a real bcrypt verify took.
       */
      now?: () => number
    } = {},
  ) {
    this.cfg = { ...DEFAULT_LOCKOUT_CONFIG, ...opts.config }
    this.onLockout = opts.onLockout ?? (() => {})
    this.now = opts.now ?? Date.now
  }

  /**
   * Returns a non-null decision when the username is currently locked.
   * Caller should refuse the login attempt before checking the password,
   * so a constant-time-equivalent rejection doesn't leak whether the
   * password would have matched. `at` evaluates against a specific
   * timestamp instead of the clock.
   */
  check(username: string, at?: number): LockoutDecision | null {
    if (process.env['OST_DISABLE_LOCKOUT'] === '1') return null
    const now = at ?? this.now()
    const s = this.state.get(username)
    if (!s) return null
    if (s.hardLocked) {
      return { retryAfterMs: Number.MAX_SAFE_INTEGER, kind: 'permanent' }
    }
    if (s.lockedUntil !== null && s.lockedUntil > now) {
      return { retryAfterMs: s.lockedUntil - now, kind: 'temporary' }
    }
    return null
  }

  /**
   * Records a failed login. May transition the user's state into
   * temporary or permanent lockout; the `onLockout` callback fires on
   * each transition (caller can write an audit entry). `at` records the
   * failure at a specific timestamp instead of the clock's.
   */
  recordFailure(username: string, at?: number): void {
    if (process.env['OST_DISABLE_LOCKOUT'] === '1') return
    const now = at ?? this.now()
    const s = this.state.get(username) ?? {
      failures: [],
      cumulative: 0,
      lockedUntil: null,
      hardLocked: false,
    }
    const cutoff = now - this.cfg.windowMs
    s.failures = s.failures.filter((t) => t > cutoff)
    s.failures.push(now)
    s.cumulative += 1

    if (s.cumulative >= this.cfg.thresholdHard && !s.hardLocked) {
      s.hardLocked = true
      this.onLockout({ username, kind: 'permanent', failures: s.cumulative })
    } else if (
      s.failures.length >= this.cfg.thresholdShort &&
      (s.lockedUntil === null || s.lockedUntil <= now)
    ) {
      s.lockedUntil = now + this.cfg.lockoutMs
      this.onLockout({ username, kind: 'temporary', failures: s.failures.length })
    }

    this.state.set(username, s)
  }

  /** Clears all state for the username — call on successful login. */
  recordSuccess(username: string): void {
    this.state.delete(username)
  }

  /** Admin-only: lifts a hard lockout. */
  manualUnlock(username: string): void {
    this.state.delete(username)
  }

  /** Test hook: reset every user's state. */
  reset(): void {
    this.state.clear()
  }
}

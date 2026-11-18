/**
 * Simple in-memory circuit breaker.
 *
 * Keyed by `platform:connectionId` (or just `platform` when connectionId is absent).
 *
 * States:
 *   closed   — normal operation, failures accumulate
 *   open     — requests rejected immediately with 503 until cooldown elapses
 *   half-open — one probe request allowed; if it succeeds → closed, if it
 *               fails → back to open with reset cooldown timer
 */

type BreakerState = 'closed' | 'open' | 'half-open'

type BreakerEntry = {
  state: BreakerState
  failures: number
  openedAt?: number
  probeInFlight: boolean
}

export type CircuitBreakerError = Error & { statusCode: 503; code: 'CIRCUIT_OPEN' }

export function isCircuitBreakerError(err: unknown): err is CircuitBreakerError {
  return err instanceof Error && (err as CircuitBreakerError).code === 'CIRCUIT_OPEN'
}

export class CircuitBreaker {
  private readonly map = new Map<string, BreakerEntry>()

  constructor(
    /** Number of consecutive failures before the circuit opens. */
    private readonly threshold = 5,
    /** Milliseconds to wait in open state before moving to half-open. */
    private readonly cooldownMs = 30_000,
  ) {}

  private entry(key: string): BreakerEntry {
    if (!this.map.has(key)) {
      this.map.set(key, { state: 'closed', failures: 0, probeInFlight: false })
    }
    return this.map.get(key)!
  }

  /**
   * Returns true when the circuit is open and the caller should short-circuit
   * with a 503 response. Returns false when the request may proceed.
   */
  isOpen(key: string): boolean {
    const e = this.entry(key)
    if (e.state === 'closed') return false

    if (e.state === 'open') {
      const elapsed = Date.now() - (e.openedAt ?? 0)
      if (elapsed < this.cooldownMs) return true
      e.state = 'half-open'
    }

    if (e.state === 'half-open') {
      if (e.probeInFlight) return true
      e.probeInFlight = true
      return false
    }

    return false
  }

  /**
   * Would a request be refused right now? A look-ahead that takes nothing.
   *
   * `isOpen()` cannot serve that purpose: in half-open it GRANTS the single
   * probe to whoever asks and returns false. A caller that asks and then makes
   * no request — the sync worker's job-level check, before its per-collection
   * checks — left the probe claimed forever, and the connection locked out for
   * the life of the process. Use this for "should I even start?"; use
   * `isOpen()` immediately before the request that will call `recordSuccess`
   * or `recordFailure`.
   */
  peek(key: string): boolean {
    const e = this.entry(key)
    if (e.state === 'closed') return false
    if (e.state === 'open') return Date.now() - (e.openedAt ?? 0) < this.cooldownMs
    return e.probeInFlight
  }

  recordSuccess(key: string): void {
    const e = this.entry(key)
    e.state = 'closed'
    e.failures = 0
    e.probeInFlight = false
    e.openedAt = undefined
  }

  recordFailure(key: string): void {
    const e = this.entry(key)
    e.probeInFlight = false
    e.failures += 1
    if (e.state === 'half-open' || e.failures >= this.threshold) {
      e.state = 'open'
      e.openedAt = Date.now()
    }
  }

  /**
   * Manually reset a circuit to closed state (admin recovery).
   * If no key is provided, resets all circuits.
   */
  reset(key?: string): void {
    if (key !== undefined) {
      this.map.delete(key)
    } else {
      this.map.clear()
    }
  }

  /** Returns all keys with non-closed circuit state. */
  openKeys(): string[] {
    const keys: string[] = []
    for (const [key, entry] of this.map) {
      if (entry.state !== 'closed') keys.push(key)
    }
    return keys
  }

  /** Throw a 503 error with CIRCUIT_OPEN code. */
  static throwOpen(platform: string): never {
    const err = new Error(
      `Platform "${platform}" is temporarily unavailable — circuit breaker open`,
    ) as CircuitBreakerError
    err.statusCode = 503
    err.code = 'CIRCUIT_OPEN'
    throw err
  }
}

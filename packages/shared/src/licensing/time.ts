export const DAY_MS = 86_400_000
/** EXPIRING starts 30 days before exp. */
export const EXPIRING_WINDOW_MS = 30 * DAY_MS
/** GRACE lasts 30 days after exp; DEGRADED follows. */
export const GRACE_PERIOD_MS = 30 * DAY_MS
/** A clock may go back this far before the rollback guard stops believing it. */
export const ROLLBACK_TOLERANCE_MS = DAY_MS

export type TimeState = 'VALID' | 'EXPIRING' | 'GRACE' | 'DEGRADED'

export function classifyTime(expMs: number, nowMs: number): TimeState {
  if (nowMs >= expMs + GRACE_PERIOD_MS) return 'DEGRADED'
  if (nowMs >= expMs) return 'GRACE'
  if (nowMs >= expMs - EXPIRING_WINDOW_MS) return 'EXPIRING'
  return 'VALID'
}

export interface ClockObservation {
  effectiveNowMs: number
  maxSeenAtMs: number
  rollbackDetected: boolean
}

/** effectiveNow = max(systemNow, max_seen_at − 24 h); a rollback is systemNow below that floor (handover §5.6). */
export function computeClock(
  systemNowMs: number,
  previousMaxSeenMs: number | null,
): ClockObservation {
  if (previousMaxSeenMs === null) {
    return { effectiveNowMs: systemNowMs, maxSeenAtMs: systemNowMs, rollbackDetected: false }
  }
  const floor = previousMaxSeenMs - ROLLBACK_TOLERANCE_MS
  return {
    effectiveNowMs: Math.max(systemNowMs, floor),
    maxSeenAtMs: Math.max(previousMaxSeenMs, systemNowMs),
    rollbackDetected: systemNowMs < floor,
  }
}

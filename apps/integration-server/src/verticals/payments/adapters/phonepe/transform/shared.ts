/**
 * Helpers shared across PhonePe transform files.
 *
 * PhonePe quotes every amount in paise (integer MINOR units) — the same as
 * the canonical schema — so no scaling is needed. PhonePe settles only in
 * INR. Timestamps arrive as epoch-millisecond `Long`s and must be coerced
 * to strict ISO-8601 via `toIsoDatetime`.
 */
import { DEFAULT_CURRENCY } from '../constants'

export function pickCurrency(v: string | null | undefined): string {
  return (v ?? DEFAULT_CURRENCY).toUpperCase()
}

/** Coerce an unknown into a non-negative integer minor-unit amount. */
export function toMinorUnits(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n)
}

/** Flatten an arbitrary value into a canonical string map, dropping nullish. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
  return out
}

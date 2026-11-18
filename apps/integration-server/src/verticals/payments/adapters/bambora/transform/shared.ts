/**
 * Helpers shared across Bambora transform files.
 *
 * Bambora returns amounts as decimal-dollar strings or numbers (e.g. "10.00"),
 * not minor units, so we convert to integer cents to satisfy the canonical
 * schema (which is always minor units). It also returns `approved` as the
 * string "1"/"0" and dates as `YYYY-MM-DDTHH:MM:SS` without a timezone, which
 * `toIsoDatetime` normalises at the call site.
 */
import { DEFAULT_CURRENCY } from '../constants'

export function pickCurrency(v: string | null | undefined): string {
  return (v ?? DEFAULT_CURRENCY).toUpperCase()
}

/** Bambora amounts are major-unit decimals; convert to integer minor units. */
export function toMinorUnits(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : Number(v)
  if (Number.isNaN(n)) return 0
  return Math.round(n * 100)
}

/** Bambora encodes booleans as the strings "1" (true) / "0" (false). */
export function isApproved(v: number | string | null | undefined): boolean {
  return String(v ?? '') === '1'
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined || v === '') continue
    out[k] = String(v)
  }
  return out
}

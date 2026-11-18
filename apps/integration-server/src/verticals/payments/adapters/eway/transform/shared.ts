/**
 * Helpers shared across the eWAY Rapid transform files.
 *
 * eWAY returns money as integer minor units already (`TotalAmount: 1000` is
 * AUD $10.00), so no major→minor conversion is needed — unlike some other
 * gateways. Transaction success is reported in two complementary ways: a
 * boolean `TransactionStatus` plus a two-character bank `ResponseCode` where
 * `"00"` is the canonical approval code. `Errors` is a comma-separated list of
 * Rapid error codes (e.g. `"V6010,V6011"`) on failures.
 */
import { DEFAULT_CURRENCY } from '../constants'

export function pickCurrency(v: string | null | undefined): string {
  return (v ?? DEFAULT_CURRENCY).toUpperCase()
}

/** eWAY amounts are already integer minor units; coerce to a safe number. */
export function toMinorUnits(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.round(n) : 0
}

/** `"00"` is eWAY's approved bank response code. */
export function isApprovedCode(code: string | null | undefined): boolean {
  return (code ?? '').trim() === '00'
}

/**
 * Split eWAY's comma-separated `Errors` string into individual error codes,
 * dropping blanks. Returns undefined when there were no errors.
 */
export function splitErrors(errors: string | null | undefined): string[] | undefined {
  if (!errors) return undefined
  const codes = errors
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
  return codes.length > 0 ? codes : undefined
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

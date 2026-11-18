/**
 * Helpers shared across Network International (N-Genius) transform files.
 *
 * N-Genius expresses money as an `amount` object — `{ currencyCode, value }`
 * — where `value` is already an integer in minor units (e.g. 1000 = 10.00 AED).
 * Currency codes are ISO 4217. Timestamps arrive as ISO-8601 strings
 * (`createDateTime` / `updateDateTime`) but are normalised through
 * `toIsoDatetime` so the canonical schema's strict-ISO contract holds.
 */
import { toIsoDatetime } from '@opensteward/shared'

export interface NgeniusAmount {
  currencyCode?: string
  value?: number
}

/** Default currency AED (N-Genius is UAE-anchored) when none is present. */
export function pickCurrency(amount: NgeniusAmount | null | undefined): string {
  return (amount?.currencyCode ?? 'AED').toUpperCase()
}

/** Integer minor-unit value out of an N-Genius amount object. */
export function pickAmount(amount: NgeniusAmount | null | undefined): number {
  return typeof amount?.value === 'number' ? amount.value : 0
}

/** Re-export so transforms have one import surface for timestamps. */
export { toIsoDatetime }

/** Flatten a scalar map into the canonical `metadata` string map. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'object') continue
    out[k] = String(v)
  }
  return out
}

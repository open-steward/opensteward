/**
 * Helpers shared across Vipps MobilePay transform files.
 *
 * Vipps represents money as an `{ value, currency }` object where `value` is an
 * integer in the currency's minor units (e.g. 49900 = 499.00 NOK), so no float
 * coercion is needed. Currency is an ISO 4217 uppercase code. Timestamps are
 * ISO-8601 strings — but every datetime is still routed through `toIsoDatetime`
 * to satisfy the strict canonical contract (requires `Z`/`±HH:MM`).
 */
import { toIsoDatetime } from '@opensteward/shared'
import { DEFAULT_CURRENCY } from '../constants'

export { toIsoDatetime }

/** Vipps amount envelope: integer minor units + ISO 4217 currency. */
export interface VippsAmount {
  value?: number
  currency?: string
}

/** Default to NOK when a nested amount object omits the currency. */
export function pickCurrency(v: string | null | undefined, fallback = DEFAULT_CURRENCY): string {
  return (v ?? fallback).toUpperCase()
}

/** Coerce an arbitrary record into a flat string→string metadata map. */
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

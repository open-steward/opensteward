/**
 * Helpers shared across Nexi (Nets Easy) transform files.
 *
 * Nexi represents money as integer minor units (e.g. 5500 = 55.00 SEK) inside
 * an `{ amount, currency }` object, so no float coercion is needed. Currency is
 * ISO 4217 uppercase. Timestamps are ISO-8601 strings with an offset — but we
 * still pass every datetime through `toIsoDatetime` to satisfy the strict
 * canonical contract (require `Z`/`±HH:MM`).
 */
import { toIsoDatetime } from '@opensteward/shared'

/** Nexi amount envelope: integer minor units + ISO 4217 currency. */
export interface NexiAmount {
  amount?: number
  currency?: string
}

export { toIsoDatetime }

/** Default to the order currency when a nested amount object omits it. */
export function pickCurrency(v: string | null | undefined, fallback = 'EUR'): string {
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

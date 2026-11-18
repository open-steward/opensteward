/**
 * Helpers shared across Computop transform files.
 *
 * Computop represents money as an `{ value, currency }` object where `value`
 * is already an integer in the currency's minor units (cents), so no
 * float-coercion is needed. Timestamps arrive as ISO-8601 strings; we still
 * route them through `toIsoDatetime` so the strict `IsoDatetime` schema always
 * sees a normalised value (or `undefined` when missing).
 */
import { toIsoDatetime } from '@opensteward/shared'

/** Normalise any upstream timestamp into a strict ISO-8601 string. */
export function toIso(input: unknown): string | undefined {
  return toIsoDatetime(input)
}

/** Coerce a Computop currency code to an uppercase ISO-4217 string. */
export function pickCurrency(v: unknown): string {
  return String(v ?? 'EUR').toUpperCase()
}

/** Integer minor-unit amount, defaulting to 0 when absent/unparseable. */
export function pickAmount(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

/** Flatten an arbitrary object into a `Record<string, string>` metadata map. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
  return out
}

export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  if (v === null || v === undefined) return undefined
  return String(v)
}

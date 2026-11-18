/**
 * Helpers shared across Faspay transform files.
 *
 * Faspay settles in Indonesian Rupiah (IDR), which has no minor unit in
 * practice — amounts cross the wire as whole-rupiah integer *strings*
 * (`"100000"`). The canonical schema carries `amount` as integer minor units,
 * so for IDR that is the same integer; we only need to coerce the string to a
 * number. Datetimes arrive as `YYYY-MM-DD HH:MM:SS` (no timezone) and must be
 * normalised via `toIsoDatetime`. Transforms never throw: missing optionals
 * collapse to `undefined`.
 */
import { toIsoDatetime } from '@opensteward/shared'

export { toIsoDatetime }

export const DEFAULT_CURRENCY = 'IDR'

/** Faspay returns a single fixed currency (IDR); accept an override defensively. */
export function pickCurrency(v: string | null | undefined): string {
  const c = (v ?? '').trim()
  return c ? c.toUpperCase() : DEFAULT_CURRENCY
}

/** Coerce a Faspay integer-string amount (`"100000"`) into an integer. */
export function toAmount(v: string | number | null | undefined): number | undefined {
  if (v == null || v === '') return undefined
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''))
  if (Number.isNaN(n)) return undefined
  return Math.round(n)
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

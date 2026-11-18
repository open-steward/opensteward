/**
 * Helpers shared across PayTabs transform files.
 *
 * PayTabs represents money as a decimal *major-unit* string (e.g. `"500.00"`)
 * alongside an ISO-4217 currency code (`AED`, `SAR`, `USD`, …). The canonical
 * payments schema stores integer *minor units*, so every amount is scaled by
 * 100. Datetimes arrive as `"YYYY-MM-DD HH:mm:ss"`-style strings and are
 * normalised through `toIsoDatetime` to guarantee strict offset form.
 */
import { toIsoDatetime } from '@opensteward/shared'

export { toIsoDatetime }

/**
 * Convert a PayTabs decimal major-unit amount string into integer minor units.
 * `"500.00"` → `50000`. Returns `undefined` for missing / unparseable input so
 * optional fields stay absent rather than wrong.
 */
export function toMinorUnits(amount: string | number | null | undefined): number | undefined {
  if (amount == null || amount === '') return undefined
  const n = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(n)) return undefined
  return Math.round(n * 100)
}

/** Currency code, uppercased. Defaults to AED (PayTabs' home market) when absent. */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'AED').toUpperCase()
}

/** Coerce an arbitrary object into a `Record<string, string>` metadata map. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    out[k] = String(v)
  }
  return out
}

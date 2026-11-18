/**
 * Helpers shared across Circle Mint transform files.
 *
 * Circle represents money as a decimal *major-unit* string (e.g. `"3.14"`)
 * alongside an ISO-4217 currency code (`USD`, `EUR`, `USDC`, `EURC`). The
 * canonical payments schema stores integer *minor units*, so every amount is
 * scaled by 100 (Circle's fiat + USDC/EURC amounts all carry two decimals).
 * Datetimes already arrive as ISO-8601 strings but are still normalised
 * through `toIsoDatetime` to guarantee strict offset form.
 */
import { toIsoDatetime } from '@opensteward/shared'

export { toIsoDatetime }

/** A Circle money object: a decimal major-unit string + ISO currency code. */
export interface CircleMoney {
  amount?: string
  currency?: string
}

/**
 * Convert a Circle decimal major-unit amount string into integer minor units.
 * `"3.14"` → `314`. Returns `undefined` for missing / unparseable input so
 * optional fields stay absent rather than wrong.
 */
export function toMinorUnits(amount: string | null | undefined): number | undefined {
  if (amount == null || amount === '') return undefined
  const n = Number(amount)
  if (!Number.isFinite(n)) return undefined
  return Math.round(n * 100)
}

/** Currency code, uppercased. Defaults to USD when absent. */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'USD').toUpperCase()
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

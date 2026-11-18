/**
 * Helpers shared across Bolt transform files.
 *
 * Bolt represents money as integer minor units already (e.g. `amount: 754`
 * with `currency: "USD"` == $7.54), so no float-coercion is needed. Amounts
 * may arrive flat (`amount` + `currency` siblings) or nested in an
 * `{ amount, currency }` object — `pickMoney` normalises both.
 *
 * Transforms never throw: every helper returns `undefined` (or a safe
 * default) for missing/unparseable input, matching the canonical-schema
 * contract (missing-rather-than-wrong).
 */

/** A Bolt money value: either a flat integer or a nested `{ amount, currency }`. */
export type BoltMoney = number | { amount?: number; currency?: string } | null | undefined

export function pickMoney(value: BoltMoney): { amount: number; currency?: string } {
  if (value == null) return { amount: 0 }
  if (typeof value === 'number') return { amount: value }
  if (typeof value === 'object') {
    return {
      amount: typeof value.amount === 'number' ? value.amount : 0,
      currency: value.currency,
    }
  }
  return { amount: 0 }
}

/** Bolt is USD-first; default to USD when no currency is supplied. */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'USD').toUpperCase()
}

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

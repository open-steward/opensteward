/**
 * Sezzle money is always an `{ amount_in_cents, currency }` object — integer
 * minor units, so no float coercion. Sezzle is US/CA-first; default currency
 * is USD when a payload omits it. Timestamps are ISO-8601 strings.
 */

export interface SezzleAmount {
  amount_in_cents?: number
  currency?: string
}

export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'USD').toUpperCase()
}

/** Read minor units out of a Sezzle `{ amount_in_cents, currency }` object. */
export function amountInCents(money: SezzleAmount | null | undefined): number {
  return money?.amount_in_cents ?? 0
}

/** Read the currency out of a Sezzle money object, defaulting to USD. */
export function amountCurrency(money: SezzleAmount | null | undefined): string {
  return pickCurrency(money?.currency)
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    out[k] = String(v)
  }
  return out
}

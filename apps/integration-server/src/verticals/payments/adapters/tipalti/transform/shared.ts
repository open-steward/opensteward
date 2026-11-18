/**
 * Helpers shared across Tipalti transform files.
 *
 * Tipalti represents money as a `{ amount: number, currency: string }` object
 * where `amount` is a decimal major-unit value (e.g. 125.00). The canonical
 * payments schema stores integer minor units, so `toMinorUnits` rounds to the
 * nearest minor unit. Currency codes arrive as ISO 4217 already; we upper-case
 * defensively and fall back to USD when absent.
 *
 * Transforms must never throw — every helper returns `undefined`/a safe
 * default for missing or malformed input.
 */

export interface TipaltiAmount {
  amount?: number | string | null
  currency?: string | null
}

/** Convert a Tipalti decimal major-unit amount to integer minor units. */
export function toMinorUnits(value: number | string | null | undefined): number {
  if (value == null || value === '') return 0
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

export function amountMinor(money: TipaltiAmount | null | undefined): number {
  return toMinorUnits(money?.amount)
}

export function pickCurrency(value: string | null | undefined): string {
  const v = (value ?? '').trim()
  return v ? v.toUpperCase() : 'USD'
}

/** Build a string→string metadata map, dropping null/undefined values. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined || v === '') continue
    out[k] = String(v)
  }
  return out
}

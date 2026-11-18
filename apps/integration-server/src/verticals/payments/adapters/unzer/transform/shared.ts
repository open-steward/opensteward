/**
 * Helpers shared across Unzer transform files.
 *
 * Unzer reports money as *decimal-major-unit strings* (e.g. `"100.0000"`,
 * `currency: "EUR"`) — NOT integer minor units. The canonical schema wants an
 * integer count of minor units, so `toMinorUnits` multiplies by the currency
 * exponent and rounds.
 *
 * Unzer settles mostly EUR + other European/2-decimal currencies; a small
 * zero-decimal table covers the rare exceptions so a flat ×100 stays correct.
 * EUR is the default when the wire omits a currency.
 */
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'HUF', 'ISK', 'CLP'])

export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'EUR').toUpperCase()
}

/** Decimal-major-unit string/number → integer minor units. */
export function toMinorUnits(
  amount: string | number | null | undefined,
  currency: string | null | undefined,
): number {
  if (amount == null || amount === '') return 0
  const value = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(value)) return 0
  const exponent = ZERO_DECIMAL.has((currency ?? 'EUR').toUpperCase()) ? 0 : 2
  return Math.round(value * 10 ** exponent)
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    if (typeof v === 'object') continue
    out[k] = String(v)
  }
  return out
}

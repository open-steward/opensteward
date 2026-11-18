/**
 * Mollie returns money as `{ value: "10.50", currency: "EUR" }` — decimal
 * strings in major units (with JPY-like currencies already in whole units).
 * The simple multiplier here is correct for currencies with exponent 2 and
 * undercounts by 100× for zero-decimal currencies (JPY, KRW, ISK, …). For
 * v1 we accept that trade-off; a fully ISO 4217-aware converter belongs in
 * shared currency utilities.
 */
export function decimalToMinor(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'EUR').toUpperCase()
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

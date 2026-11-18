/**
 * Mercado Pago returns money as floats in major units. Convert to integer
 * minor units. Zero-decimal currencies (e.g. JPY) are not special-cased;
 * every amount is scaled by 100.
 */
export function decimalToMinor(v: number | string | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'ARS').toUpperCase()
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

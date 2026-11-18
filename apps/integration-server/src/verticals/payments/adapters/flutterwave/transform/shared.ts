/**
 * Flutterwave returns money as a float in major units. Convert to integer
 * minor units (×100). JPY/KRW zero-decimal currencies are not supported
 * by Flutterwave's African settlement coverage; this conversion is safe.
 */
export function decimalToMinor(v: number | string | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'NGN').toUpperCase()
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

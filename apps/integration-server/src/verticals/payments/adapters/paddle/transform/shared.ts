/**
 * Paddle Billing returns money as strings of integer minor units — e.g.
 * `{ amount: "1000", currency_code: "USD" }` = $10.00.
 */
export function strToMinor(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseInt(v, 10) : v
  return Number.isFinite(n) ? n : 0
}

export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'USD').toUpperCase()
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

/**
 * Razorpay returns amounts as integer minor units already. Timestamps are
 * Unix seconds; convert to ISO when surfacing.
 */
export function toIso(unix: number | undefined): string | undefined {
  if (unix == null) return undefined
  return new Date(unix * 1000).toISOString()
}

export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'INR').toUpperCase()
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

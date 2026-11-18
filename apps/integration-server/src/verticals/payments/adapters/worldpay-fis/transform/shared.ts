/**
 * Worldpay Access returns money as integer minor units already. No conversion.
 */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'GBP').toUpperCase()
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

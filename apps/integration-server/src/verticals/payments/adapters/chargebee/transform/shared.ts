/**
 * Chargebee returns money as integer minor units. Timestamps are Unix
 * seconds.
 */
export function toIso(unix: number | undefined): string | undefined {
  if (unix == null) return undefined
  return new Date(unix * 1000).toISOString()
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

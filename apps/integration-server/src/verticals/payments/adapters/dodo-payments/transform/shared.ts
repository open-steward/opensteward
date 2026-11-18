/**
 * Helpers shared across Dodo Payments transform files.
 *
 * Dodo returns money as integer minor units (e.g. cents) already, ISO 4217
 * currency codes verbatim, and ISO 8601 timestamps. Transforms must never
 * throw — drop unparseable/missing optionals rather than blowing up.
 */

/** Uppercase an ISO 4217 code; fall back to USD (Dodo's default settlement). */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'USD').toUpperCase()
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    out[k] = String(v)
  }
  return out
}

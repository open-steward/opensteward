/**
 * Helpers shared across Spreedly transform files.
 *
 * Spreedly returns money as integer minor units (`amount` is already in cents)
 * alongside an ISO-4217 `currency_code`. Timestamps (`created_at`,
 * `updated_at`) arrive as ISO-8601 strings with an offset, so they only need
 * normalising through `toIsoDatetime`. Currency may be absent on vaulted
 * payment methods, in which case we leave it `undefined` rather than guessing.
 */
export function pickCurrency(v: string | null | undefined): string | undefined {
  if (!v) return undefined
  return v.toUpperCase()
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

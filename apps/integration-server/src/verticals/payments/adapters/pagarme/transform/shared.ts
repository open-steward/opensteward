/**
 * Helpers shared across Pagar.me transform files.
 *
 * Pagar.me represents money in **centavos** (integer minor units) already, so
 * no float coercion is needed. The default settlement currency is BRL; the
 * API does not always echo a `currency` on every object, so `pickCurrency`
 * falls back to BRL. Timestamps are ISO-8601 strings (e.g.
 * `2024-11-15T09:00:00Z`) and are normalised via `toIsoDatetime` at the
 * call site.
 */
export function pickCurrency(v: unknown): string {
  return (typeof v === 'string' && v ? v : 'BRL').toUpperCase()
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

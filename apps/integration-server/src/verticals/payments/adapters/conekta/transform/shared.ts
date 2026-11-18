/**
 * Conekta returns money in centavos — integer minor units already (no
 * conversion needed). Conekta is a Mexico-first gateway and the API returns
 * `currency` as an ISO 4217 code (typically MXN, sometimes USD); we default
 * to MXN when the field is absent.
 */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'MXN').toUpperCase()
}

/**
 * Conekta metadata values are already strings/scalars, but the canonical
 * schema requires `Record<string, string>`. Coerce every non-null value and
 * drop nulls — never throw.
 */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
  return out
}

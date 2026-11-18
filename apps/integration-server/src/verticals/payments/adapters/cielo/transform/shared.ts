/**
 * Cielo settles in Brazilian Real and quotes `Amount` in *centavos* (integer
 * minor units, no decimal) — already canonical-shaped. `Currency` is an
 * ISO-4217 alpha code ("BRL"); `Country` is alpha-3 ("BRA").
 */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'BRL').toUpperCase()
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

/**
 * Cielo timestamps arrive as either bare ISO-8601 (`2026-01-15T09:30:00`,
 * no zone) or `.NET`-style without a `Z`. The canonical schema demands a
 * strict ISO-8601 string, so we normalise a missing zone to UTC and return
 * `undefined` (never throw) when the value is absent or unparseable — keeping
 * to the transform contract.
 */
export function isoOrUndefined(v: string | null | undefined): string | undefined {
  if (!v || typeof v !== 'string') return undefined
  const trimmed = v.trim()
  if (!trimmed) return undefined
  // Already carries an offset / Z → trust it.
  const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)
  const candidate = hasZone ? trimmed : `${trimmed}Z`
  const d = new Date(candidate)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

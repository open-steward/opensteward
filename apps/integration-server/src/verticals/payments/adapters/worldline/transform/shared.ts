/**
 * Helpers shared across Worldline Direct transform files.
 *
 * Worldline represents money as integer minor units (`amount`) alongside an
 * ISO-4217 `currencyCode`, so no float-coercion is needed. Timestamps such as
 * `statusOutput.statusCodeChangeDateTime` arrive as `YYYYMMDDHHMMSS` strings
 * and must be normalised to strict ISO-8601 before assignment.
 */

export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'EUR').toUpperCase()
}

/**
 * Worldline `statusCodeChangeDateTime` is `YYYYMMDDHHMMSS` (UTC), e.g.
 * `20260204093000`. Convert to a value `toIsoDatetime` can parse; anything
 * else (already-ISO, epoch, undefined) is passed straight through.
 */
export function worldlineDateTime(v: unknown): string | number | Date | undefined {
  if (v == null || v === '') return undefined
  if (typeof v === 'string' && /^\d{14}$/.test(v)) {
    const y = v.slice(0, 4)
    const mo = v.slice(4, 6)
    const d = v.slice(6, 8)
    const h = v.slice(8, 10)
    const mi = v.slice(10, 12)
    const s = v.slice(12, 14)
    return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`
  }
  return v as string | number | Date
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    if (typeof v === 'object') continue
    out[k] = String(v)
  }
  return out
}

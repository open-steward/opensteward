/**
 * Helpers shared across PayU transform files.
 *
 * PayU quotes money in MINOR units already (e.g. `"3200"` = 32.00 PLN), but
 * encodes the amount as a *string*. The canonical schema wants an integer in
 * minor units, so we parse defensively. Datetimes ship as ISO-8601 with a
 * timezone offset (e.g. `2020-07-02T09:19:04.013+02:00`) — strict-ISO already,
 * but we still normalise through `toIsoDatetime` per the canonical contract.
 */

/** Parse a PayU amount string/number into integer minor units, or `0`. */
export function toMinorUnits(v: unknown): number {
  if (typeof v === 'number') return Math.round(v)
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? Math.round(n) : 0
  }
  return 0
}

/** PayU defaults to PLN; multi-currency POS configs override per order. */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'PLN').toUpperCase()
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    if (typeof v === 'object') {
      out[k] = JSON.stringify(v)
    } else {
      out[k] = String(v)
    }
  }
  return out
}

export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  if (v == null) return undefined
  return String(v)
}

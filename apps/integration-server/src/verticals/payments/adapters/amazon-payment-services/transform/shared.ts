/**
 * Helpers shared across APS / PayFort transform files.
 *
 * APS quotes money as an integer string in the currency's minor units already
 * (e.g. `"10000"` = 100.00 for a two-decimal currency), so amounts only need
 * parsing to an integer — no scaling. The canonical schema is integer minor
 * units, which matches directly.
 *
 * A response_code is 5 digits: a 2-digit status + a 3-digit message. The
 * trailing `000` message always means success for that status.
 */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'AED').toUpperCase()
}

/** Parse an APS amount string/number to an integer in minor units. */
export function toMinorUnits(amount: string | number | null | undefined): number {
  if (amount == null) return 0
  const n = typeof amount === 'string' ? Number(amount) : amount
  if (!Number.isFinite(n)) return 0
  return Math.round(n)
}

/** Whether an APS response_code (`<status><message>`) indicates success. */
export function isSuccessCode(responseCode: string | null | undefined): boolean {
  if (!responseCode) return false
  return responseCode.length >= 5 && responseCode.slice(2) === '000'
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

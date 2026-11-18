/**
 * Helpers shared across Fiserv Commerce Hub transform files.
 *
 * Commerce Hub represents money as a *decimal major unit* (`amount.total:
 * 12.04`, `currency: 'USD'`) — unlike most gateways and unlike the canonical
 * `Charge`/`Refund` schema, which use integer minor units. `toMinorUnits`
 * converts on the way in; `toMajorUnits` converts on the way out.
 *
 * Zero-decimal currencies (JPY, KRW, …) have no minor unit, so a `12` JPY
 * total is already 12 "minor" units. We special-case the common ones.
 */

/** ISO 4217 currencies with no minor unit (factor 1) or three decimals. */
const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'])
const THREE_DECIMAL = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'])

function minorUnitFactor(currency: string | undefined): number {
  const c = (currency ?? '').toUpperCase()
  if (ZERO_DECIMAL.has(c)) return 1
  if (THREE_DECIMAL.has(c)) return 1000
  return 100
}

/** Decimal major-unit total → integer minor units (e.g. 12.04 USD → 1204). */
export function toMinorUnits(total: number | null | undefined, currency: string | undefined): number {
  if (total == null || Number.isNaN(total)) return 0
  return Math.round(total * minorUnitFactor(currency))
}

/** Integer minor units → decimal major-unit total (e.g. 1204 USD → 12.04). */
export function toMajorUnits(minor: number | null | undefined, currency: string | undefined): number {
  if (minor == null || Number.isNaN(minor)) return 0
  return minor / minorUnitFactor(currency)
}

/** Default currency USD; always upper-cased to satisfy the ISO 4217 schema. */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'USD').toUpperCase()
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    if (typeof v === 'object') {
      out[k] = JSON.stringify(v)
      continue
    }
    out[k] = String(v)
  }
  return out
}

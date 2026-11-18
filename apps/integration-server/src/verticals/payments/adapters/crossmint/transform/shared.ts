/**
 * Helpers shared across Crossmint transform files.
 *
 * Crossmint reports money as a `{ amount, currency }` pair where `amount` is a
 * decimal string in MAJOR units (e.g. `"0.50"` USD, `"1.25"` for 1.25 USDC) —
 * unlike most gateways which already emit integer minor units. The canonical
 * schema wants integer minor units, so `toMinorUnits` parses the decimal and
 * scales it by 100 (the 2-decimal convention shared by fiat and the USD-pegged
 * stablecoins Crossmint settles in).
 */

export interface CrossmintMoney {
  amount?: string | number | null
  currency?: string | null
}

/**
 * Parse a Crossmint decimal major-unit amount into integer minor units, or
 * `undefined` when the input is missing / unparseable (never throw — the
 * canonical contract is missing-rather-than-wrong).
 */
export function toMinorUnits(amount: string | number | null | undefined): number | undefined {
  if (amount === null || amount === undefined || amount === '') return undefined
  const n = typeof amount === 'number' ? amount : Number(String(amount).trim())
  if (!Number.isFinite(n)) return undefined
  return Math.round(n * 100)
}

/**
 * Normalise a Crossmint currency token (`"usd"`, `"usdc"`, `"eth"`) into the
 * canonical 3-letter uppercase shape the `Iso4217Currency` schema requires.
 * Crossmint settles in fiat plus a handful of crypto tokens whose tickers are
 * already ≤ 4 chars; we uppercase and, when a token isn't a clean 3-letter
 * code, fall back to `USD` (every Crossmint stablecoin amount is USD-pegged).
 */
export function pickCurrency(v: string | null | undefined): string {
  const code = (v ?? '').trim().toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : 'USD'
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
  return out
}

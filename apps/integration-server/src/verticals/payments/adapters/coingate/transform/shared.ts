/**
 * CoinGate represents money as **decimal strings in major units**
 * (`"10.0"`, `"0.00016069"`), unlike card processors that return integer
 * minor units. The canonical `Amount` schema is an integer in minor units,
 * so we convert. Crypto amounts can carry up to 8 decimal places (satoshis),
 * so a flat ×100 would lose precision; instead we scale by the number of
 * decimal places actually present (min 2) and round to the nearest integer of
 * the smallest represented unit. The exact original string is always
 * preserved on `metadata` and `raw` for lossless downstream reconciliation.
 */

/** ISO 4217 / crypto ticker — uppercased, defaulting to EUR (CoinGate's default price currency). */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'EUR').toUpperCase()
}

/**
 * Convert a CoinGate decimal-string amount to an integer count of its
 * smallest represented unit. `"10.0"` → 1000 (2dp → minor units),
 * `"0.00016069"` → 16069 (8dp). Returns 0 for missing/unparseable input
 * (never throws — canonical transforms must not throw).
 */
export function toMinorUnits(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  const str = String(v).trim()
  const n = Number(str)
  if (!Number.isFinite(n)) return 0
  const dot = str.indexOf('.')
  const decimals = dot === -1 ? 0 : str.length - dot - 1
  const scale = Math.max(2, decimals)
  return Math.round(n * Math.pow(10, scale))
}

/**
 * CoinGate metadata-ish values are scalars; the canonical schema requires
 * `Record<string, string>`. Coerce every non-null value, JSON-encode nested
 * objects, and drop nulls. Never throw.
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

/**
 * Helpers shared across 2C2P transform files.
 *
 * Money: 2C2P quotes amounts in MAJOR units as decimal strings/numbers with up
 * to 5 dp (`amount` is "D 12,5", e.g. `100.00`). The canonical schema is
 * integer minor units, so amounts are scaled by 100 and rounded.
 *
 * 2C2P is multi-currency across SE Asia (THB, SGD, MYR, IDR, PHP, VND, …); the
 * default fallback is THB (the home market) when a currency is absent.
 *
 * Datetimes arrive as `yyyyMMddHHmmss` (no separators, no timezone) — UTC by
 * convention — and must be normalised to strict ISO-8601.
 */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'THB').toUpperCase()
}

/** Major-unit decimal (e.g. `100.00`) → minor-unit integer. 0 for non-finite. */
export function toMinorUnits(major: number | string | null | undefined): number {
  const n = typeof major === 'string' ? Number(major) : major
  if (n == null || !Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/**
 * 2C2P `transactionDateTime` is `yyyyMMddHHmmss` in UTC with no separators.
 * Convert to an ISO-8601 string; return undefined for absent/malformed input
 * so transforms never throw on optional datetimes.
 */
export function toIso2c2p(v: string | number | null | undefined): string | undefined {
  if (v == null) return undefined
  const s = String(v).trim()
  if (!/^\d{14}$/.test(s)) return undefined
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}Z`
  const t = Date.parse(iso)
  return Number.isNaN(t) ? undefined : new Date(t).toISOString()
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

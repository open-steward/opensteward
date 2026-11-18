/**
 * Helpers shared across Belvo transform files.
 *
 * Belvo quotes money in MAJOR units (e.g. 150.75 BRL/MXN) as decimals, while
 * the canonical payments schema is integer MINOR units. `toMinorUnits`
 * scales by 100 and rounds. Currency defaults to BRL (Belvo's largest market)
 * when a payload omits it.
 *
 * Transforms NEVER throw: every helper returns `undefined` for missing /
 * unparseable input so a partial upstream payload still yields a valid
 * canonical object.
 */

/** Scale a Belvo major-unit decimal amount into integer minor units. */
export function toMinorUnits(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const n = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(n)) return undefined
  return Math.round(n * 100)
}

/** ISO 4217 currency, uppercased; defaults to BRL when absent. */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'BRL').toUpperCase()
}

/** Coerce to string, dropping null/undefined. */
export function pickStr(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined
  if (typeof v === 'string') return v
  return String(v)
}

/** Flatten an arbitrary object into a string→string metadata map, dropping
 *  null/undefined and stringifying nested objects via JSON. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
  return out
}

/**
 * Shared primitives for the Megaventory transforms.
 *
 * Field shapes confirmed against the live service's ServiceStack metadata on
 * 2026-09-18 (https://api.megaventory.com/v2017a/json/metadata?op=…).
 */

/**
 * Megaventory serialises dates in the .NET JSON format, not ISO:
 *
 *   "/Date(1530110485503-0000)/"
 *
 * and an UNSET date comes back as DateTime.MinValue:
 *
 *   "/Date(-62135596800000-0000)/"   =  0001-01-01T00:00:00Z
 *
 * Both were observed in the live metadata examples. `new Date(…)` on the raw
 * string yields Invalid Date, so a transform that treats these as ISO loses
 * every timestamp silently; and one that parses the number but not the
 * sentinel publishes dates in the year 1, which sort before everything and
 * read as real data.
 */
const DOTNET_DATE = /^\/Date\((-?\d+)([+-]\d{4})?\)\/$/

/** DateTime.MinValue in epoch milliseconds — Megaventory's "no value". */
const DOTNET_MIN_VALUE_MS = -62135596800000

export function toIso(value: unknown): string | undefined {
  if (value == null) return undefined
  const str = typeof value === 'string' ? value : String(value)
  if (!str) return undefined

  const dotnet = DOTNET_DATE.exec(str)
  if (dotnet) {
    const ms = Number(dotnet[1])
    if (!Number.isFinite(ms) || ms === DOTNET_MIN_VALUE_MS) return undefined
    return new Date(ms).toISOString()
  }

  // Not every field is a .NET date; accept a plain parseable date too rather
  // than dropping it.
  const d = new Date(str)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

/** Empty strings are Megaventory's "unset" for text fields. */
export function pickStr(v: unknown): string | undefined {
  if (v == null) return undefined
  const s = typeof v === 'string' ? v : String(v)
  const t = s.trim()
  return t ? t : undefined
}

export function pickNum(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (!Number.isNaN(n)) return n
  }
  return undefined
}

export function pickBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v
  if (v === 1 || v === '1' || v === 'true' || v === 'True') return true
  if (v === 0 || v === '0' || v === 'false' || v === 'False') return false
  return undefined
}

/** Flatten scalars for the canonical `metadata` record. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'object') continue
    out[k] = String(v)
  }
  return out
}

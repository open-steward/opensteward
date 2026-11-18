/**
 * Helpers shared across Privy transform files.
 *
 * Privy returns timestamps as ISO 8601 strings (sometimes with a timezone
 * offset, sometimes `YYYY-MM-DD HH:mm:ss`); `toIso` normalises them to a
 * strict UTC ISO-8601 instant and returns undefined for anything
 * unparseable so transforms never throw on missing/garbage dates.
 */

export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  if (v == null) return undefined
  return String(v)
}

export function pickNum(v: unknown): number | undefined {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v !== '') {
    const n = Number(v)
    if (!Number.isNaN(n)) return n
  }
  return undefined
}

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

export function toIso(s: unknown): string | undefined {
  const str = pickStr(s)
  if (!str) return undefined
  // Privy sometimes returns `YYYY-MM-DD HH:mm:ss` (space, no zone); treat it
  // as UTC by swapping in a `T` and appending `Z` before parsing.
  const normalised = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)
    ? `${str.replace(' ', 'T')}Z`
    : str
  const d = new Date(normalised)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

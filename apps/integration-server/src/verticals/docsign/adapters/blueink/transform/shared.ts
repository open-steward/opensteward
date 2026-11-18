/**
 * Helpers shared across Blueink transform files. Blueink returns ISO 8601
 * timestamps already; the helpers here normalise nulls, coerce string ints,
 * and emit strict ISO datetimes. Transforms never throw — every helper
 * returns `undefined` rather than raising on missing/invalid input.
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

/** Strict ISO-8601. Returns undefined for null/empty/unparseable input. */
export function toIsoDatetime(s: unknown): string | undefined {
  const str = pickStr(s)
  if (!str) return undefined
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

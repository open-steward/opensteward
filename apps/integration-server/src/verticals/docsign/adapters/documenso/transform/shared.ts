/**
 * Helpers shared across Documenso transform files.
 *
 * Documenso returns numeric primary keys, ISO-8601 datetime strings, and
 * SCREAMING_SNAKE_CASE enums. The helpers here normalise nulls, coerce ids to
 * strings, and parse datetimes strictly (invalid → undefined). Transforms
 * never throw.
 */

export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string') return v.length > 0 ? v : undefined
  if (typeof v === 'number') return String(v)
  if (v == null) return undefined
  return String(v)
}

export function pickNum(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'string' && v !== '') {
    const n = Number(v)
    if (!Number.isNaN(n)) return n
  }
  return undefined
}

/** Coerce a numeric/string id to a stable string id. */
export function idStr(v: unknown): string {
  return v == null ? '' : String(v)
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

/** Strict ISO-8601 parse; returns undefined for null/invalid inputs. */
export function toIso(s: unknown): string | undefined {
  if (s == null) return undefined
  const str = typeof s === 'string' ? s : s instanceof Date ? s.toISOString() : String(s)
  if (!str) return undefined
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

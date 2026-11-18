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

/**
 * Convert a value to a strict ISO-8601 datetime string.
 *
 * Accepts:
 *   - Unix epoch milliseconds (number) — as used by Huly (modifiedOn / createdOn)
 *   - ISO-8601 / RFC-2822 date strings
 *
 * Returns `undefined` for null/undefined/invalid inputs.
 * Never throws.
 */
export function toIso(s: unknown): string | undefined {
  if (s == null) return undefined
  let d: Date
  if (typeof s === 'number') {
    d = new Date(s)
  } else {
    const str = typeof s === 'string' ? s : String(s)
    if (!str) return undefined
    d = new Date(str)
  }
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

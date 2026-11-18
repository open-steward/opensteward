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
 * Convert any date representation to strict ISO-8601.
 *
 * JSM date objects look like:
 *   { epochMillis: 1234567890000, iso8601: "2009-02-13T23:31:30.000Z", ... }
 * We prefer iso8601, falling back to epochMillis, then direct string parse.
 */
export function toIso(s: unknown): string | undefined {
  if (s == null) return undefined
  // JSM date-shape object
  if (typeof s === 'object' && s !== null) {
    const obj = s as Record<string, unknown>
    if (typeof obj['iso8601'] === 'string' && obj['iso8601']) {
      const d = new Date(obj['iso8601'] as string)
      if (!Number.isNaN(d.getTime())) return d.toISOString()
    }
    if (typeof obj['epochMillis'] === 'number') {
      return new Date(obj['epochMillis'] as number).toISOString()
    }
    return undefined
  }
  const str = typeof s === 'string' ? s : String(s)
  if (!str) return undefined
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

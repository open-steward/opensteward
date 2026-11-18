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

export function pickBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v
  if (v === 1 || v === '1' || v === 'true' || v === 'Y') return true
  if (v === 0 || v === '0' || v === 'false' || v === 'N') return false
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
  if (s == null) return undefined
  // Handle numeric epoch milliseconds
  if (typeof s === 'number') {
    if (!Number.isFinite(s)) return undefined
    return new Date(s).toISOString()
  }
  const str = typeof s === 'string' ? s : String(s)
  if (!str) return undefined
  // Handle ASP.NET legacy /Date(milliseconds)/ and /Date(milliseconds+offset)/ formats
  const aspMatch = /^\/Date\((-?\d+)([+-]\d{4})?\)\/$/.exec(str)
  if (aspMatch) {
    const ms = parseInt(aspMatch[1], 10)
    if (!Number.isFinite(ms)) return undefined
    return new Date(ms).toISOString()
  }
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

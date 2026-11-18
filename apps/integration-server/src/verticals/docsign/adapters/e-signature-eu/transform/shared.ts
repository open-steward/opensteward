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
  if (typeof v === 'string') {
    if (v === 'true' || v === '1') return true
    if (v === 'false' || v === '0') return false
  }
  return undefined
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'object') continue
    const s = String(v)
    if (s === '') continue
    out[k] = s
  }
  return out
}

/**
 * e-Signature.eu serves timestamps as space-separated UTC strings without a
 * timezone marker, e.g. `"2026-04-13 22:47:48"`. Empty strings (the API's
 * placeholder for "not yet") and unparsable values return undefined so
 * optional canonical datetimes stay absent rather than throwing.
 */
export function toIso(s: unknown): string | undefined {
  const str = pickStr(s)
  if (!str) return undefined
  // Normalise "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DDTHH:MM:SSZ" (treat as UTC).
  const normalised = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)
    ? `${str.replace(' ', 'T')}Z`
    : str
  const d = new Date(normalised)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

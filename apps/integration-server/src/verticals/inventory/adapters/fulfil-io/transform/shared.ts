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
  const str = typeof s === 'string' ? s : String(s)
  if (!str) return undefined
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

/**
 * Fulfil returns Many2One fields as [id, rec_name] tuples or plain integers.
 * Extract the id as a string.
 */
export function m2oId(v: unknown): string | undefined {
  if (v == null) return undefined
  if (Array.isArray(v) && v.length >= 1) return String(v[0])
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string' && v !== '') return v
  return undefined
}

/**
 * Fulfil returns Many2One fields as [id, rec_name]. Extract the display name.
 */
export function m2oName(v: unknown): string | undefined {
  if (Array.isArray(v) && v.length >= 2) return String(v[1])
  return undefined
}

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
  if (v === 1 || v === '1' || v === 'true' || v === 'S' || v === 'sim') return true
  if (v === 0 || v === '0' || v === 'false' || v === 'N' || v === 'nao' || v === 'não') return false
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
 * Parse a date/datetime string (possibly Brazilian DD/MM/YYYY format) to ISO-8601.
 * Never throws — returns undefined on unparseable input.
 */
export function toIso(s: unknown): string | undefined {
  if (s == null) return undefined
  const str = typeof s === 'string' ? s : String(s)
  if (!str) return undefined

  // Brazilian date: DD/MM/YYYY or DD/MM/YYYY HH:mm:ss
  const brMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})(.*)$/)
  if (brMatch) {
    const iso = `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}${brMatch[4] ?? ''}`
    const d2 = new Date(iso)
    if (!Number.isNaN(d2.getTime())) return d2.toISOString()
  }

  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

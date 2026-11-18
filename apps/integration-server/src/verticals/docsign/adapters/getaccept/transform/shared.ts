/**
 * Helpers shared across GetAccept transform files. GetAccept emits ISO
 * 8601 timestamps with millisecond precision; the helpers normalise edge
 * cases.
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
  if (s == null) return undefined
  if (typeof s === 'number' && Number.isFinite(s)) return new Date(s).toISOString()
  if (typeof s === 'string') {
    if (s === '') return undefined
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return undefined
}

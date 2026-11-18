/**
 * Helpers shared across eversign transform files.
 *
 * eversign returns most timestamps as Unix seconds. `toIso` is overloaded
 * to handle both numeric epoch seconds and ISO strings so the transforms
 * stay short.
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
  if (typeof s === 'number') {
    // eversign sends epoch seconds; treat values <= 1e12 as seconds.
    const ms = s < 1e12 ? s * 1000 : s
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  if (typeof s === 'string' && s.length > 0) {
    // Numeric strings come through as epoch seconds too.
    if (/^\d+$/.test(s)) {
      const n = Number(s)
      const ms = n < 1e12 ? n * 1000 : n
      const d = new Date(ms)
      return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
    }
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  return undefined
}

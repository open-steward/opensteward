/**
 * Helpers shared across Lumin Sign transform files.
 *
 * Lumin returns timestamps as Unix-epoch **milliseconds** — sometimes typed
 * as a number in the OpenAPI schema, sometimes serialised as a numeric
 * string. `toIso` accepts either (plus a fallback for the rare ISO string)
 * and emits a strict ISO-8601 datetime, returning undefined when the value
 * is missing or unparseable so transforms never throw.
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

/**
 * Coerce a Lumin timestamp (epoch-ms number, numeric string, or ISO string)
 * to a strict ISO-8601 datetime. Returns undefined when absent/unparseable.
 */
export function toIso(v: unknown): string | undefined {
  if (v == null) return undefined
  // Epoch-milliseconds path: number or all-digit string.
  if (typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v))) {
    const ms = typeof v === 'number' ? v : Number(v)
    if (!Number.isFinite(ms) || ms <= 0) return undefined
    const d = new Date(ms)
    if (Number.isNaN(d.getTime())) return undefined
    return d.toISOString()
  }
  // Fallback: ISO / RFC string.
  if (typeof v === 'string') {
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return undefined
    return d.toISOString()
  }
  return undefined
}

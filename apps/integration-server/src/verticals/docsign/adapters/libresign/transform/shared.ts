/**
 * Helpers shared across LibreSign transform files.
 *
 * LibreSign emits two timestamp shapes: ISO-8601 strings (e.g. `created_at`)
 * and Unix epoch seconds inside `notify[].date` / `metadata`. Both are
 * normalised to strict ISO-8601 here. Transforms never throw — missing
 * optionals return `undefined`.
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

/** Normalise an ISO-8601 string to strict ISO-8601; `undefined` on failure. */
export function toIso(s: unknown): string | undefined {
  const str = pickStr(s)
  if (!str) return undefined
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

/** LibreSign `notify[].date` and some metadata use Unix epoch seconds. */
export function epochToIso(unix: unknown): string | undefined {
  if (unix == null) return undefined
  const n = typeof unix === 'number' ? unix : Number(unix)
  if (Number.isNaN(n) || n === 0) return undefined
  return new Date(n * 1000).toISOString()
}

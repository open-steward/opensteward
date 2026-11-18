/** A non-empty string form of a field value; null, undefined and '' are absent. */
export function pickStr(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined
  const s = typeof v === 'string' ? v : String(v)
  return s.length > 0 ? s : undefined
}

/** Scalar entries only, stringified; null, undefined and objects are dropped. */
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

/** An ISO-8601 UTC string, or undefined for an absent or unparseable value. */
export function toIso(s: unknown): string | undefined {
  if (s == null) return undefined
  const str = typeof s === 'string' ? s : String(s)
  if (!str) return undefined
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

/**
 * Helpers shared across Yoti Sign transform files.
 *
 * `toIsoDatetime` (re-exported from @opensteward/shared) is the canonical
 * datetime normaliser — every `*At` field must run through it so the wire
 * value is strict ISO-8601. The rest normalise nulls and coerce loose
 * scalar maps for the canonical `metadata` field.
 */
export { toIsoDatetime } from '@opensteward/shared'

export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  if (v == null) return undefined
  return String(v)
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

/**
 * Helpers shared across SignRequest transform files.
 *
 * SignRequest returns most resources as flat JSON with snake_case keys,
 * ISO-8601 datetimes, and a mix of booleans + nullable strings. The helpers
 * here normalise nulls and re-export the canonical `toIsoDatetime` so every
 * datetime assignment is strict ISO-8601. Transforms never throw — missing
 * optionals come back as `undefined`.
 */

export { toIsoDatetime } from '@opensteward/shared'

export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  if (v == null) return undefined
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return undefined
}

export function pickNum(v: unknown): number | undefined {
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  if (typeof v === 'string' && v !== '') {
    const n = Number(v)
    if (!Number.isNaN(n)) return n
  }
  return undefined
}

/** Flatten an object into a `Record<string, string>` (scalars only). */
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

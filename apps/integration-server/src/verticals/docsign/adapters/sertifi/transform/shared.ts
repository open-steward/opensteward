/**
 * Helpers shared across Sertifi transform files.
 *
 * Sertifi datetimes are normalised to strict ISO-8601 via the shared
 * `toIsoDatetime` (it copes with both ISO and `YYYY-MM-DD HH:mm` shapes
 * Sertifi emits). `pickStr` / `pickNum` / `strMap` coerce nullable fields
 * and build the canonical `metadata` string map. Transforms never throw —
 * missing optionals resolve to `undefined`.
 */

export { toIsoDatetime } from '@opensteward/shared'

export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  if (v == null) return undefined
  if (typeof v === 'object') return undefined
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

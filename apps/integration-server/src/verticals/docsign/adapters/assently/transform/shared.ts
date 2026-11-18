/**
 * Helpers shared across the Assently transform files.
 *
 * Assently returns timestamps as UTC ISO-ish strings (`2026-01-15T09:30:00`)
 * without an explicit zone, so timestamps run through the canonical
 * `toIsoDatetime` helper which normalises them to strict ISO-8601. The other
 * helpers normalise nulls and coerce string maps.
 */

export { toIsoDatetime as toIso } from '@opensteward/shared'

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

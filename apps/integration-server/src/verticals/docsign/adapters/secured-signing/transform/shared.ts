/**
 * Helpers shared across Secured Signing transform files.
 *
 * Secured Signing returns date strings that may omit a timezone offset
 * (e.g. "2026-01-15T09:30:00"), so every datetime assignment goes through
 * the canonical `toIsoDatetime` helper, which normalises to strict ISO-8601
 * or drops the value. Transforms never throw — missing optionals come back
 * as `undefined`.
 */

export { toIsoDatetime } from '@opensteward/shared'

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

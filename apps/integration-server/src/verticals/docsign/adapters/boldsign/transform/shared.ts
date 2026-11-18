/**
 * Helpers shared across BoldSign transform files. BoldSign returns most
 * timestamps as Unix epoch *seconds* (e.g. `createdDate: 1663611441`), so
 * `epochToIso` normalises them to strict ISO-8601 via the canonical
 * `toIsoDatetime` helper (which also tolerates ISO strings, should a field
 * ever come back as one).
 */

import { toIsoDatetime } from '@opensteward/shared'

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
 * BoldSign timestamps are Unix epoch seconds (numbers) on most resources.
 * `toIsoDatetime` treats numeric inputs ≤ 9_999_999_999 as epoch seconds and
 * returns undefined for missing/invalid values — never throwing.
 */
export function epochToIso(v: unknown): string | undefined {
  return toIsoDatetime(v)
}

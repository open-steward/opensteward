/**
 * Helpers shared across GMO Sign transform files.
 *
 * GMO Sign returns most fields as strings (status codes, ids) and any
 * timestamps as ISO-ish date strings. `toIso` funnels datetimes through the
 * canonical `toIsoDatetime` helper so the wire output is always strict
 * ISO-8601 (or undefined — transforms never throw on a missing optional).
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

/** Normalise any GMO Sign datetime to strict ISO-8601; undefined if absent/invalid. */
export function toIso(s: unknown): string | undefined {
  return toIsoDatetime(s)
}

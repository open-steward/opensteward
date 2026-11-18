/**
 * Helpers shared across FPT.eContract transform files.
 *
 * FPT.eContract returns timestamps in a mix of ISO-8601 strings and epoch
 * values; `toIso` normalises any of them to strict ISO-8601 via the canonical
 * `toIsoDatetime` helper (which tolerates ISO strings, space-separated
 * datetimes, and epoch seconds/millis, and returns undefined — never throws —
 * for missing/invalid values).
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

/** Coerce any FPT.eContract timestamp to strict ISO-8601, or undefined. */
export function toIso(v: unknown): string | undefined {
  return toIsoDatetime(v)
}

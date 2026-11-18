/**
 * Helpers shared across Proof transform files.
 *
 * Proof returns ISO-8601 timestamps with timezone offsets; datetimes are
 * normalised through the canonical `toIsoDatetime` helper at every
 * assignment (strict ISO-8601 is the schema contract). The remaining
 * helpers normalise nulls and build the canonical string-map `metadata`.
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

/** Strict ISO-8601 normalisation, or undefined for missing/unparseable. */
export function toIso(s: unknown): string | undefined {
  return toIsoDatetime(s)
}

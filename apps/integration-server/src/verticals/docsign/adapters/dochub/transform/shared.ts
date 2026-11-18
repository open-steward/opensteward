/**
 * Helpers shared across DocHub transform files.
 *
 * DocHub returns ISO-8601 timestamps; datetime normalisation goes through
 * the canonical `toIsoDatetime` helper (strict ISO, undefined-on-bad-input)
 * so the transform layer never emits a non-conformant timestamp and never
 * throws on a missing/garbled field.
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

/** Strict ISO-8601 normaliser — delegates to the canonical helper. */
export function toIso(s: unknown): string | undefined {
  return toIsoDatetime(s)
}

/**
 * Helpers shared across the actaSIGN transform files.
 *
 * actaSIGN returns ISO-8601 timestamps and snake_case JSON. Datetimes are
 * normalised through the canonical `toIsoDatetime` (re-exported here as
 * `toIso`) so every `*At` assignment is strict ISO-8601 or `undefined`.
 * Transforms never throw — missing optionals become `undefined`.
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

/** Strict ISO-8601 or undefined. Delegates to the canonical coercer. */
export function toIso(s: unknown): string | undefined {
  return toIsoDatetime(s)
}

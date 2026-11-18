/**
 * Helpers shared across Jotform Sign transform files.
 *
 * Jotform returns timestamps as `YYYY-MM-DD HH:MM:SS` (no timezone, space
 * separator) and most scalars as strings; `toIso` defers to the canonical
 * `toIsoDatetime` so every datetime is emitted as strict ISO-8601.
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

/** Coerce a Jotform timestamp into strict ISO-8601, or undefined. */
export function toIso(s: unknown): string | undefined {
  return toIsoDatetime(s)
}

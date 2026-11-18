/**
 * Helpers shared across ZorroSign transform files.
 *
 * ZorroSign returns snake_case JSON and ISO-8601 timestamps. `toIso` delegates
 * to the shared strict-ISO coercion so every canonical datetime is normalised
 * (or dropped when unparseable) rather than passed through raw.
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

/** Strict ISO-8601 coercion; returns undefined for missing/unparseable input. */
export function toIso(s: unknown): string | undefined {
  return toIsoDatetime(s)
}

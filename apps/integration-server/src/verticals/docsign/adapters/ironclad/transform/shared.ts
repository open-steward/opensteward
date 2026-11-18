/**
 * Helpers shared across Ironclad transform files.
 *
 * Ironclad returns all timestamps as ISO-8601 strings (e.g.
 * `"2016-11-17T00:37:22.318Z"`), so `toIso` delegates to the canonical
 * `toIsoDatetime` helper, which normalises to strict ISO-8601 and returns
 * undefined for missing/invalid values — never throwing.
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

export function toIso(v: unknown): string | undefined {
  return toIsoDatetime(v)
}

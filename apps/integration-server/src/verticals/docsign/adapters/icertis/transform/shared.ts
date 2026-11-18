/**
 * Helpers shared across Icertis (ICI) transform files.
 *
 * ICI returns most attribute values as strings inside an attribute bag and
 * uses ISO 8601 (sometimes without an offset) for dates. `toIso` is the
 * canonical strict-ISO coercion from @opensteward/shared (re-exported here
 * so every transform imports from one place); the rest normalise nulls and
 * pick safe defaults. Transforms NEVER throw — missing optionals return
 * undefined.
 */

import { toIsoDatetime } from '@opensteward/shared'

export const toIso = toIsoDatetime

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

/**
 * Helpers shared across Signaturely transform files.
 *
 * Signaturely returns string UUIDs, ISO-8601 datetimes with a `Z` offset
 * (e.g. `2021-07-27T09:36:34.824Z`), and lower-case enums. The helpers here
 * normalise nulls, coerce ids/counts, and parse datetimes strictly via the
 * shared `toIsoDatetime` (invalid → undefined). Helpers never throw; a
 * transform throws when a documented required field (e.g. an activity's `id`
 * or `createdAt`) is missing, rather than inventing a value.
 */

import { toIsoDatetime } from '@opensteward/shared'

export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string') return v.length > 0 ? v : undefined
  if (typeof v === 'number') return String(v)
  if (v == null) return undefined
  return String(v)
}

export function pickNum(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
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

/** Strict ISO-8601 normalisation; returns undefined for null/invalid inputs. */
export function toIso(s: unknown): string | undefined {
  return toIsoDatetime(s)
}

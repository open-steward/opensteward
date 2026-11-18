/**
 * Helpers shared across Signable transform files.
 *
 * Signable returns string ids/fingerprints, ISO-8601 datetimes with a
 * numeric offset (e.g. `2025-07-07T11:30:27+0000`), counts as strings, and
 * lower-case enums (sometimes with spaces, e.g. `in progress`). The helpers
 * here normalise nulls, coerce ids/counts, and parse datetimes strictly
 * (invalid → undefined). Transforms never throw.
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

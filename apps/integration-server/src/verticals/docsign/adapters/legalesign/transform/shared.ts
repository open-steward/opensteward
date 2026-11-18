/**
 * Helpers shared across Legalesign transform files.
 *
 * Legalesign returns string ids/uuids, ISO-8601 datetimes, integer status
 * codes, and references to other resources as Tastypie resource URIs such as
 * `/api/v1/document/<uuid>/`. The helpers here normalise nulls, coerce
 * scalars, parse datetimes strictly (invalid → undefined), and extract the
 * trailing id from a resource URI. Transforms never throw.
 */

import { toIsoDatetime } from '@opensteward/shared'

/** Tastypie list pagination metadata wrapper. */
export interface ListMeta {
  limit?: number
  offset?: number
  total_count?: number
  next?: string | null
  previous?: string | null
}

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

/**
 * Extract the trailing id from a Legalesign resource URI such as
 * `/api/v1/document/<uuid>/` → `<uuid>`. Returns undefined for empty/`None`
 * values, and passes through anything that isn't a slash-delimited URI.
 */
export function idFromUri(uri: unknown): string | undefined {
  if (typeof uri !== 'string') return undefined
  const trimmed = uri.trim()
  if (!trimmed || trimmed === 'None') return undefined
  if (!trimmed.includes('/')) return trimmed
  const parts = trimmed.split('/').filter((p) => p.length > 0)
  return parts[parts.length - 1]
}

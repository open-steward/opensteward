/**
 * Helpers shared across Certinal transform files.
 *
 * Certinal returns most timestamps as ISO-8601 strings (e.g. createdDate,
 * lastUpdatedDate) and some as epoch values (expiresAtTimestamp). All
 * datetime assignments route through the shared `toIsoDatetime`, which is
 * strict ISO-8601 and drops invalid/missing values instead of throwing —
 * matching the canonical "missing-rather-than-wrong" contract.
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

/** Strict ISO-8601 (or undefined) for any Certinal timestamp shape. */
export function toIso(v: unknown): string | undefined {
  return toIsoDatetime(v)
}

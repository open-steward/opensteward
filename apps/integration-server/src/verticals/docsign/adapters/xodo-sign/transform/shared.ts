/**
 * Helpers shared across Xodo Sign (eversign) transform files.
 *
 * Xodo Sign returns timestamps as Unix epoch seconds (e.g. `created`,
 * `completed`, `expires`, `signed_timestamp`, `log[].timestamp`). We lean
 * on the shared `toIsoDatetime` helper — it treats numbers ≤ 9_999_999_999
 * as epoch seconds — so every datetime lands as strict ISO-8601 or
 * `undefined`, matching the canonical missing-rather-than-wrong contract.
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

/** Xodo Sign epoch-seconds (or any parseable timestamp) → strict ISO-8601. */
export function toIso(v: unknown): string | undefined {
  if (v === 0 || v === '0') return undefined
  return toIsoDatetime(v)
}

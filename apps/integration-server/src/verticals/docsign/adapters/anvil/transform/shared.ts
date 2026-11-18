/**
 * Helpers shared across Anvil transform files.
 *
 * Anvil's GraphQL API returns ISO-8601 `DateTime` strings already, but every
 * datetime is still normalised through the canonical `toIsoDatetime` helper
 * (re-exported here) so the schema's strict-ISO contract is enforced at every
 * assignment. Transforms never throw — missing optionals become `undefined`.
 */

import { toIsoDatetime } from '@opensteward/shared'

export { toIsoDatetime }

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

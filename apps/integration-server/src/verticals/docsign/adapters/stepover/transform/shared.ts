/**
 * Helpers shared across StepOver transform files.
 *
 * The Tyr web service exposes very little structured metadata about a
 * signature request — the status query returns only an integer status code —
 * so these helpers normalise that scalar into the canonical shape. Datetimes,
 * when present, are coerced to strict ISO-8601 via `toIsoDatetime`.
 */

import { toIsoDatetime } from '@opensteward/shared'

export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  if (v == null) return undefined
  return String(v)
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

export function toIso(s: unknown): string | undefined {
  return toIsoDatetime(s)
}

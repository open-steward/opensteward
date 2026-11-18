/**
 * Helpers shared across Signzy Contract360 transform files.
 *
 * Datetimes are normalised through the canonical `toIsoDatetime` (re-exported
 * here as `toIso`) so every `createdAt` / `signedAt` / `occurredAt` assignment
 * is strict ISO-8601. Signzy returns timestamps in mixed shapes (epoch millis,
 * epoch seconds, ISO strings), all of which `toIsoDatetime` handles.
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

/** Strict ISO-8601 or undefined. Thin alias over the canonical helper. */
export function toIso(v: unknown): string | undefined {
  return toIsoDatetime(v)
}

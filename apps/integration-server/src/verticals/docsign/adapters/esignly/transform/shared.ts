/**
 * Helpers shared across eSignly transform files.
 *
 * eSignly returns mixed-shape JSON: timestamps as ISO strings or epoch
 * seconds, ids/counts as strings or numbers. `toIso` delegates to the
 * canonical `toIsoDatetime` so every datetime is normalised to strict
 * ISO-8601. Transforms never throw — missing optionals return undefined.
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

/** Normalise any upstream timestamp to strict ISO-8601, or undefined. */
export function toIso(s: unknown): string | undefined {
  return toIsoDatetime(s)
}

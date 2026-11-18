/**
 * Helpers shared across pdfFiller transform files.
 *
 * pdfFiller returns timestamps as ISO-8601 strings (occasionally with a
 * space separator or no offset); `toIso` delegates to the canonical
 * `toIsoDatetime` so every datetime lands as strict ISO-8601. Most other
 * fields come back as scalars that fold cleanly into a string map.
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

/** Normalise any pdfFiller timestamp into strict ISO-8601 (or undefined). */
export function toIso(s: unknown): string | undefined {
  return toIsoDatetime(s)
}

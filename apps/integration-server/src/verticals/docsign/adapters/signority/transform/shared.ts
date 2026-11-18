/**
 * Helpers shared across Signority transform files.
 *
 * Signority returns most timestamps as epoch milliseconds (e.g.
 * `createdTime: 1590593250000`) and occasionally as `YYYY-MM-DD HH:mm:ss.S`
 * strings (e.g. `documentSentTime`). `toIso` delegates to the shared
 * `toIsoDatetime`, which normalises both forms into strict ISO-8601 (and
 * returns undefined for missing/invalid values — transforms never throw).
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

/** Strict ISO-8601 (epoch-millis, epoch-seconds, or space-separated strings). */
export function toIso(v: unknown): string | undefined {
  return toIsoDatetime(v)
}

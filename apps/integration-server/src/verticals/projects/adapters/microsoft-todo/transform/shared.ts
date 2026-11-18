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

/** Strict ISO-8601 coercion (canonical-transform rule for every datetime). */
export function toIso(s: unknown): string | undefined {
  return toIsoDatetime(s)
}

/**
 * Microsoft Graph `dateTimeTimeZone` wrapper, e.g.
 * `{ "dateTime": "2026-02-15T17:00:00.0000000", "timeZone": "UTC" }`.
 * Several To Do task fields (due/start/completed/reminder) use it. We treat
 * the wall-clock `dateTime` as the timestamp; `toIsoDatetime` normalises the
 * 7-digit fractional second and missing offset to a strict ISO string.
 */
export interface GraphDateTime {
  dateTime?: string
  timeZone?: string
}

export function fromGraphDateTime(v: GraphDateTime | null | undefined): string | undefined {
  if (!v || typeof v !== 'object') return undefined
  return toIsoDatetime(v.dateTime)
}

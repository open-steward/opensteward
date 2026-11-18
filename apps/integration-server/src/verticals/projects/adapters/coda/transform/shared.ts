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

/**
 * Coerce a Coda timestamp into strict ISO-8601, or undefined.
 *
 * Coda serializes `createdAt` / `updatedAt` as RFC 3339 strings (e.g.
 * `2023-04-21T22:00:00.000Z`), which `toIsoDatetime` normalises natively.
 */
export function toIso(s: unknown): string | undefined {
  return toIsoDatetime(s)
}

/**
 * Shared transform helpers for the BigTime adapter.
 *
 * `toIso` delegates to the canonical `toIsoDatetime` so every datetime is
 * coerced to strict ISO-8601 (or dropped when missing/unparseable) — BigTime
 * returns dates like `2026-01-15T09:30:00` (no zone) which must be normalised.
 */
import { toIsoDatetime } from '@opensteward/shared'

export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string') return v.length > 0 ? v : undefined
  if (v == null) return undefined
  const s = String(v)
  return s.length > 0 ? s : undefined
}

export function pickNum(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isNaN(v) ? undefined : v
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

/** Strict ISO-8601 coercion (BigTime dates often lack a timezone offset). */
export function toIso(s: unknown): string | undefined {
  return toIsoDatetime(s)
}

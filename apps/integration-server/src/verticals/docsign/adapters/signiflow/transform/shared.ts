/**
 * Helpers shared across SigniFlow transform files.
 *
 * SigniFlow returns timestamps in mixed shapes (ISO-8601, `YYYY-MM-DD
 * HH:MM:SS`, or .NET epoch-millis strings), so the transform layer normalises
 * every datetime through the canonical `toIsoDatetime` helper before assigning
 * it to a schema field. Transforms never throw — missing/unparseable values
 * become `undefined`.
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

/** Strict ISO-8601 coercion for any SigniFlow timestamp shape. */
export function toIso(v: unknown): string | undefined {
  return toIsoDatetime(v)
}

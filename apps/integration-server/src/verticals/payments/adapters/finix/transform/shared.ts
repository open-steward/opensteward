/**
 * Helpers shared across Finix transform files.
 *
 * Finix represents money as integer minor units already (`amount: 1000` =
 * $10.00), so no float coercion is needed. Timestamps arrive as ISO-8601
 * strings (e.g. `2025-10-24T17:38:19.09Z`) but may be missing or non-ISO,
 * so route every datetime through `toIsoDatetime` for the strict canonical
 * contract.
 */
import { toIsoDatetime } from '@opensteward/shared'
import { DEFAULT_CURRENCY } from '../constants'

/** Coerce a Finix currency code (ISO 4217, e.g. `USD`) to canonical form. */
export function pickCurrency(v: string | null | undefined): string {
  const code = (v ?? '').trim().toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : DEFAULT_CURRENCY
}

/** Normalise any upstream timestamp to a strict ISO-8601 string. */
export function iso(input: unknown): string | undefined {
  return toIsoDatetime(input)
}

/**
 * Finix `tags` are an arbitrary string→string map. Flatten any extra
 * scalar context into the canonical `metadata` string map, dropping nulls.
 */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined) continue
    out[k] = String(v)
  }
  return out
}

/** A Finix association field may be a bare ID string or a nested object. */
export function refId(v: unknown): string | undefined {
  if (typeof v === 'string') return v || undefined
  if (v && typeof v === 'object' && 'id' in v) {
    const id = (v as { id?: unknown }).id
    return typeof id === 'string' ? id : undefined
  }
  return undefined
}

/**
 * Helpers shared across Atome transform files.
 *
 * Atome represents money as a positive **integer in the smallest currency unit**
 * already (e.g. `1234` SGD = S$12.34), which is exactly the canonical-schema
 * convention — so there is no major/minor unit conversion to do. Atome trades
 * only in SGD / MYR / IDR / THB / PHP; we default to SGD when a payload omits
 * the currency (it always echoes it, so this is only a defensive fallback).
 */
import { DEFAULT_CURRENCY } from '../constants'

export function pickCurrency(v: string | null | undefined): string {
  return (v ?? DEFAULT_CURRENCY).toUpperCase()
}

/** Coerce an Atome integer-minor-unit amount into a number, defaulting to 0. */
export function toMinor(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return 0
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    out[k] = String(v)
  }
  return out
}

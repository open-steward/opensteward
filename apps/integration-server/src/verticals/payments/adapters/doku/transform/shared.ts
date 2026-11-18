import { DEFAULT_CURRENCY } from '../constants'

/**
 * DOKU settles in Indonesian Rupiah and quotes amounts as whole rupiah, which
 * the canonical schema treats as integer minor units 1:1. We only need to
 * coerce the value to an integer; no scaling.
 */
export function toMinorUnits(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'number' ? v : Number(v)
  if (Number.isNaN(n)) return 0
  return Math.round(n)
}

/** DOKU only deals in IDR; honour an upstream currency if present, else default. */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? DEFAULT_CURRENCY).toUpperCase()
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

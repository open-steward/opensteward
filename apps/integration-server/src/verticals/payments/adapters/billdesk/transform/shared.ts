/**
 * Helpers shared across BillDesk transform files.
 *
 * Money: BillDesk quotes amounts as MAJOR-unit decimal strings (rupees, e.g.
 * `"299.28"`); the canonical schema is integer minor units (paise), so every
 * amount is scaled by 100. Outbound request bodies want the major-unit string
 * back.
 *
 * Currency: BillDesk uses ISO 4217 *numeric* codes on the wire (e.g. `"356"`
 * for INR). The canonical schema wants the alpha code (`"INR"`), so we map the
 * common ones and fall back to INR.
 *
 * Datetimes: BillDesk emits `+05:30`-offset ISO-8601 strings; every assignment
 * still passes through `toIsoDatetime` to satisfy the strict canonical schema.
 */
import { toIsoDatetime } from '@opensteward/shared'

export { toIsoDatetime }

/** ISO 4217 numeric → alphabetic, for the currencies BillDesk settles in. */
const NUMERIC_TO_ALPHA: Record<string, string> = {
  '356': 'INR',
  '840': 'USD',
  '978': 'EUR',
  '826': 'GBP',
  '784': 'AED',
  '702': 'SGD',
}

/** Normalise a BillDesk currency code (numeric or alpha) to an ISO alpha code. */
export function pickCurrency(v: string | null | undefined): string {
  if (!v) return 'INR'
  const trimmed = String(v).trim()
  if (/^\d+$/.test(trimmed)) return NUMERIC_TO_ALPHA[trimmed] ?? 'INR'
  return trimmed.toUpperCase()
}

/** Major-unit (rupees) string/number → minor-unit (paise) integer. */
export function toMinorUnits(major: number | string | null | undefined): number {
  const n = typeof major === 'string' ? Number(major) : major
  if (n == null || !Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/** Minor-unit (paise) → major-unit (rupees) decimal string for request bodies. */
export function toMajorUnits(minor: number | null | undefined): string | undefined {
  if (minor == null || !Number.isFinite(minor)) return undefined
  return (minor / 100).toFixed(2)
}

/** Flatten a scalar map into a canonical string→string `metadata` map. */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    if (typeof v === 'object') continue
    out[k] = String(v)
  }
  return out
}

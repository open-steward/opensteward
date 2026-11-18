/**
 * Helpers shared across HyperPay (OPPWA) transform files.
 *
 * Unlike most gateways, HyperPay returns money as a **decimal string** with a
 * dot separator (e.g. `"92.00"`, two-decimal `N10.N2`), NOT integer minor
 * units. The canonical schema stores integer minor units, so we convert with
 * `toMinorUnits` on the way in and `toDecimalString` on the way out. We assume
 * two-decimal currencies, which covers HyperPay's supported set.
 *
 * Timestamps come back as ISO-8601 strings, but we still pass every datetime
 * through `toIsoDatetime` to satisfy the strict canonical contract (require
 * `Z` / `±HH:MM`).
 *
 * Docs: https://hyperpay.docs.oppwa.com/reference/parameters
 */
import { toIsoDatetime } from '@opensteward/shared'

export { toIsoDatetime }

/** HyperPay's `result` block: a code + human-readable description. */
export interface HyperpayResult {
  code?: string
  description?: string
}

/** Default settlement currency when a response omits it. */
export function pickCurrency(v: string | null | undefined, fallback = 'USD'): string {
  return (v ?? fallback).toUpperCase()
}

/**
 * Convert a HyperPay decimal-string amount (`"92.00"`) into integer minor units
 * (`9200`). Rounds to the nearest minor unit to absorb float noise. Returns 0
 * for missing/unparseable input — never throws.
 */
export function toMinorUnits(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : Number(v)
  if (Number.isNaN(n)) return 0
  return Math.round(n * 100)
}

/**
 * Convert canonical integer minor units (`9200`) into the dot-decimal string
 * HyperPay expects on the wire (`"92.00"`).
 */
export function toDecimalString(minor: number | null | undefined): string | undefined {
  if (minor === null || minor === undefined) return undefined
  return (minor / 100).toFixed(2)
}

/**
 * HyperPay encodes the transaction outcome in `result.code`. A successful
 * (synchronous) result matches `000.000.* / 000.100.1* / 000.[36]`; a pending
 * (manually- or asynchronously-reviewed) result matches `000.200.*` or
 * `800.400.5* / 100.400.500`. Anything else is a reject/decline/error.
 *
 * Docs: https://hyperpay.docs.oppwa.com/reference/resultCodes
 */
const SUCCESS_RE = /^(000\.000\.|000\.100\.1|000\.[36]|000\.400\.0[^3]|000\.400\.100)/
const PENDING_RE = /^(000\.200|100\.400\.500|800\.400\.5)/

export type ResultOutcome = 'success' | 'pending' | 'rejected'

export function classifyResult(code: string | null | undefined): ResultOutcome {
  const c = code ?? ''
  if (SUCCESS_RE.test(c)) return 'success'
  if (PENDING_RE.test(c)) return 'pending'
  return 'rejected'
}

/** Coerce an arbitrary record into a flat string→string metadata map. */
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

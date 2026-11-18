/**
 * Helpers shared across Asaas transform files.
 *
 * Asaas is Brazil-only: every amount is denominated in **BRL** and the API
 * returns money as a **decimal number of reais** (e.g. `129.9`), not minor
 * units. The canonical schema requires integer minor units, so `toMinorUnits`
 * multiplies by 100 and rounds to the nearest centavo.
 *
 * Datetimes arrive as ISO date or date-time strings; pass them through
 * `toIsoDatetime` (re-exported from shared) so strict ISO-8601 is enforced.
 */
import { toIsoDatetime } from '@opensteward/shared'

export { toIsoDatetime }

/** Asaas settles exclusively in Brazilian reais. */
export const ASAAS_CURRENCY = 'BRL'

/**
 * Convert an Asaas reais decimal (e.g. `129.9`) into integer centavos
 * (`12990`). Returns `undefined` when the input is missing/non-numeric so
 * optional fields stay absent rather than become `NaN`.
 */
export function toMinorUnits(value: number | string | null | undefined): number | undefined {
  if (value == null || value === '') return undefined
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return undefined
  return Math.round(n * 100)
}

/**
 * Asaas metadata values are scalars, but the canonical schema requires
 * `Record<string, string>`. Coerce every non-null value and drop nulls —
 * never throw.
 */
export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
  return out
}

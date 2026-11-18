/**
 * Helpers shared across Midtrans transform files.
 *
 * Money: Midtrans returns `gross_amount` / `refund_amount` as a **decimal
 * string in MAJOR currency units** (e.g. `"12000.00"` IDR), whereas the
 * canonical schema stores `amount` as an **integer in MINOR units**. We
 * normalise by parsing the decimal and scaling by 100 — IDR is the dominant
 * currency and Midtrans bills it with two implied decimal places, matching the
 * canonical minor-unit convention. Unparseable input collapses to 0 (never
 * throw out of a transform).
 *
 * Currency: Midtrans defaults to `IDR`; the field is occasionally absent.
 */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'IDR').toUpperCase()
}

/**
 * Midtrans emits timestamps as `"YYYY-MM-DD HH:MM:SS"` with **no timezone**,
 * and they are always Western Indonesia Time (WIB, GMT+7). A bare string like
 * that would otherwise be parsed in the server's local zone, yielding the
 * wrong instant. We pin the `+07:00` offset before handing it to
 * `toIsoDatetime` so the canonical ISO value reflects the correct instant on
 * any host. Inputs that already carry an offset / `Z`, or that aren't the bare
 * Midtrans shape, are passed through untouched.
 */
export function midtransWib(input: string | null | undefined): string | undefined {
  if (input == null) return undefined
  const s = String(input).trim()
  if (!s) return undefined
  // `2024-11-15 09:00:00` (space, no tz) → `2024-11-15T09:00:00+07:00`
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(s)) {
    return s.replace(' ', 'T') + '+07:00'
  }
  return s
}

/** Decimal major-unit amount string → integer minor units (×100). */
export function toMinorUnits(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  const major = typeof v === 'number' ? v : Number(String(v).trim())
  if (!Number.isFinite(major)) return 0
  return Math.round(major * 100)
}

/**
 * Midtrans metadata-ish values are scalars; the canonical schema requires
 * `Record<string, string>`. Coerce every non-null value (objects → JSON) and
 * drop nulls — never throw.
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

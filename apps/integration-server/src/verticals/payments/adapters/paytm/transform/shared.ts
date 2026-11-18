/**
 * Paytm quotes money in MAJOR units — a decimal-string number of rupees, e.g.
 * `txnAmount: "1.00"` or `refundAmount: "150.50"`. The canonical schema is
 * integer minor units (paise), so every amount is scaled by 100. Default
 * settlement currency is INR.
 */
import { DEFAULT_CURRENCY } from '../constants'

export function pickCurrency(v: string | null | undefined): string {
  return (v ?? DEFAULT_CURRENCY).toUpperCase()
}

/** Major-unit (rupees) → minor-unit (paise) integer. Returns 0 for non-finite. */
export function toMinorUnits(major: number | string | null | undefined): number {
  const n = typeof major === 'string' ? Number(major) : major
  if (n == null || !Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/** Minor-unit (paise) → major-unit decimal string for outbound request bodies. */
export function toMajorUnits(minor: number | null | undefined): string | undefined {
  if (minor == null || !Number.isFinite(minor)) return undefined
  return (minor / 100).toFixed(2)
}

/**
 * Paytm timestamps are local datetimes in IST without a zone, e.g.
 * `"2020-05-05 14:00:28"`. Normalise to an ISO-8601 instant by treating
 * them as +05:30 (IST) so `toIsoDatetime` parses them deterministically.
 * Returns undefined for empty/blank input so optionals stay undefined.
 *
 * The bare-shape regex is anchored to `[ T]\d{2}:\d{2}:\d{2}$` — byte-
 * identical to Midtrans's `midtransWib()` — so it catches the offset-less
 * shape whether the separator is a space or a `T`. Anything not matching
 * the bare shape passes through untouched — values that already carry
 * `Z`/an offset, but also offset-less values with fractional seconds
 * (e.g. `"2020-05-05 14:00:28.123"`), which the anchored `:\d{2}:\d{2}$`
 * regex does not match. Those fall through to `toIsoDatetime`, which
 * appends `Z` (treats them as UTC) — 5.5h off from the intended IST
 * interpretation. An accepted tradeoff: keeping the regex byte-identical
 * to Midtrans's `midtransWib()` is worth more than the fractional-seconds
 * edge case.
 */
export function paytmToIso(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = String(value).trim()
  if (!trimmed) return undefined
  // Bare Paytm shape (space- or T-separated, no zone) — pin +05:30 (IST).
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed.replace(' ', 'T') + '+05:30'
  }
  return trimmed
}

/**
 * Format a `Date` as the merchant-passbook list endpoints' date-range
 * parameter shape: `YYYY-MM-DDTHH:MM:SS+05:30` (IST) — e.g. Refund List's
 * documented `startDate`/`endDate` example `"2020-06-01T00:34:00+05:30"`.
 * The inverse of `paytmToIso`'s bare-timestamp IST interpretation above.
 */
export function toPaytmDateTime(date: Date): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
  const ist = new Date(date.getTime() + IST_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  const yyyy = ist.getUTCFullYear()
  const mm = pad(ist.getUTCMonth() + 1)
  const dd = pad(ist.getUTCDate())
  const hh = pad(ist.getUTCHours())
  const mi = pad(ist.getUTCMinutes())
  const ss = pad(ist.getUTCSeconds())
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+05:30`
}

/**
 * Status vocabulary used by the merchant-passbook LIST endpoints'
 * `orderSearchStatus` (Order List row) and `acceptRefundStatus` (Refund
 * List row) fields — `SUCCESS`/`FAILURE`/`PENDING`. Distinct from the
 * `resultInfo.resultStatus` vocabulary (`TXN_SUCCESS`/`TXN_FAILURE`/...)
 * the single-lookup endpoints use, which `charge.ts`/`refund.ts` map
 * separately. Unmapped values fall through to `'unknown'` rather than being
 * silently dropped or guessed at.
 */
export function mapListStatus(
  status: string | null | undefined,
): 'succeeded' | 'failed' | 'pending' | 'unknown' {
  switch ((status ?? '').toUpperCase()) {
    case 'SUCCESS':
      return 'succeeded'
    case 'FAILURE':
      return 'failed'
    case 'PENDING':
      return 'pending'
    default:
      return 'unknown'
  }
}

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

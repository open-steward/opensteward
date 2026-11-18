/**
 * Permissive string helpers with documented max-lengths.
 *
 * The caps here are chosen to be generous enough that no real upstream
 * platform should ever exceed them, while still preventing
 * unbounded-string DoS payloads and surfacing the ceiling in the
 * generated OpenAPI as `maxLength`.
 *
 * - `Name` — display name, title, label (255 chars)
 * - `Description` — long-form free text (2000 chars)
 * - `Note` — extra-long free text (5000 chars)
 * - `ExternalId` — upstream identifier strings (256 chars)
 * - `Email` — RFC 5321 maximum (320 chars), `format: email`
 *
 * Each helper is a `z.string()`/`z.email()` with a `.max()` and a
 * `.describe()` — vertical schemas import these instead of declaring
 * `z.string()` so the OpenAPI surface stays consistent.
 */

import { z } from 'zod'

export const NAME_MAX = 255
export const DESCRIPTION_MAX = 2000
export const NOTE_MAX = 5000
export const EXTERNAL_ID_MAX = 256
export const EMAIL_MAX = 320

export const Name = z
  .string()
  .max(NAME_MAX)
  .describe('Display name (display label or title). Max 255 chars.')
  .meta({ example: 'Acme Industries' })

export const Description = z
  .string()
  .max(DESCRIPTION_MAX)
  .describe('Long-form free text. Max 2000 chars.')
  .meta({ example: 'Industrial supplies and equipment.' })

export const Note = z
  .string()
  .max(NOTE_MAX)
  .describe('Extra-long free text such as internal notes. Max 5000 chars.')
  .meta({ example: 'Net-30 terms agreed with Acme Industries.' })

export const ExternalId = z
  .string()
  .min(1)
  .max(EXTERNAL_ID_MAX)
  .describe('Upstream platform identifier. Required, non-empty. Max 256 chars.')
  .meta({ example: 'acme-industries' })

/**
 * Monetary amount in integer minor units (e.g. cents, paise, satoshi). Per
 * the API validation policy: `null` = upstream did not report this amount,
 * `0` = upstream explicitly reported zero, key-omitted = the field wasn't
 * supplied at all. Never coerce these three states into each other.
 *
 * No `.min(0)` because refunds, adjustments, and balance-due can legitimately
 * be negative. Adapters wrap with `nullish()` to allow the three-state
 * distinction.
 */
export const Amount = z
  .number()
  .int()
  .describe(
    'Integer monetary amount in minor units (e.g. cents). `null` = upstream did not report; `0` = upstream reported zero; key-omitted = upstream did not supply this field.',
  )
  .meta({ example: 125000 })

/**
 * Assert that an adapter received a required upstream monetary amount.
 *
 * Per the API validation policy, a canonical resource whose `amount` is its
 * defining property (Charge, Refund, Payout, Dispute) must NOT silently
 * coerce a missing upstream amount to `0` — that conflates "not reported"
 * with "zero". This helper throws an ingestion error instead, surfacing
 * the upstream gap to operators.
 *
 * Usage:
 *   amount: requireAmount(raw.amount, 'stripe charge'),
 */
export function requireAmount(value: number | null | undefined, source: string): number {
  if (value == null) {
    throw new Error(
      `${source}: missing required \`amount\` from upstream payload (ingestion error)`,
    )
  }
  return value
}

export const Email = z
  .email()
  .max(EMAIL_MAX)
  .describe('RFC 5321 email address. Max 320 chars.')
  .meta({ example: 'jane.doe@acme.example' })

/**
 * A calendar date — `YYYY-MM-DD`, no time, no zone.
 *
 * For a value the source states as a DATE rather than an instant. Emitting one
 * as a UTC timestamp invents both a time and a zone: `"2026-09-01"` became
 * `"2026-09-01T00:00:00.000Z"`, and a consumer rendering that locally shows
 * 2026-08-31 anywhere east of UTC, putting period-boundary invoices in the
 * wrong month.
 */
export const CalendarDate = z.iso
  .date()
  .describe('Calendar date (`YYYY-MM-DD`). No time component, because the source has none.')

/**
 * A moment in time, OR a calendar date when that is all the platform reports.
 *
 * The union is the honest shape. Platforms disagree: Xero states an invoice
 * date as a date, others as a full timestamp, and collapsing both to a
 * timestamp fabricates precision for the first group while collapsing both to
 * a date would destroy it for the second.
 *
 * A client that wants one representation should branch on the presence of `T`.
 * A client that only renders it can pass either to its date formatter.
 */
export const DateOrCalendarDate = z.union([z.date(), CalendarDate])
export type DateOrCalendarDate = z.infer<typeof DateOrCalendarDate>

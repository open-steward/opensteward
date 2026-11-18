import { expect } from 'vitest'

/**
 * Assert that a `DateOrCalendarDate` field carries the `Date` arm, and narrow
 * it so `.toISOString()` / `.getTime()` typecheck.
 *
 * `postedAt`, `dueAt` and their siblings are `z.union([z.date(), CalendarDate])`
 * — a `Date` when the platform states an instant, a `YYYY-MM-DD` string when it
 * states a date and nothing more. That union is the honest shape (see
 * `DateOrCalendarDate` in `packages/shared/src/schemas/limits.ts`), but it means
 * the inferred type is `Date | string`, and `Date`-only methods no longer
 * typecheck on it.
 *
 * The tests below reach for those methods because the adapter under test really
 * does produce the `Date` arm. That claim is worth asserting rather than
 * casting away: a transform that silently starts emitting the calendar-date
 * string should fail here, not coerce.
 *
 * This replaced 63 sites of the form:
 *
 *     expect(result.postedAt?.toISOString().startsWith('2024-02-01')).toBe(true)
 *
 * which typechecked only while the field was `Date`-only. Note the old form's
 * failure modes were poor in both directions — with `?.` an absent value made
 * the assertion `expect(undefined).toBe(true)`, and with `!.` it threw a raw
 * TypeError. Both now fail as a stated expectation.
 */
export function expectDate(value: Date | string | null | undefined): Date {
  expect(value).toBeInstanceOf(Date)
  return value as Date
}

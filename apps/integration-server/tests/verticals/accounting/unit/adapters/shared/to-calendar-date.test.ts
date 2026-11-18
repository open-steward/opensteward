import { describe, it, expect } from 'vitest'
import { toCalendarDate } from '../../../../../../src/verticals/accounting/adapters/shared/transform'

/**
 * Finding 12 — a date-only source must not acquire a fabricated time and zone.
 *
 * Xero's `DateString` is a calendar date. It arrives as `"2026-09-01T00:00:00"`
 * — zeros for the time it does not have, and no zone — and was emitted as
 * `"2026-09-01T00:00:00.000Z"`. The `Z` is invented: midnight UTC is 02:00 in
 * Stockholm, so a consumer rendering it locally shows **2026-08-31** for an
 * invoice dated the 1st, and invoices near a period boundary fall into the
 * wrong month.
 *
 * This is the same principle as Findings 2 and 23, both already fixed: do not
 * assert precision the source did not provide. `[]` was wrong for "no line
 * items reported", `{}` was wrong for "no address reported", and a UTC instant
 * is wrong for "the first of September".
 *
 * `toCalendarDate` is deliberately separate from `toUtcDate` rather than
 * guessing between them. Whether a field is a calendar date or an instant is a
 * property of the platform's API, which the adapter author knows and a
 * heuristic would get wrong — `2026-09-01T00:00:00Z` is a genuine midnight
 * instant, and only the caller can say that Xero's `DateString` is not.
 */

describe('toCalendarDate', () => {
  it('strips the fabricated zero time from a zoneless date-time', () => {
    // The exact Xero wire shape.
    expect(toCalendarDate('2026-09-01T00:00:00')).toBe('2026-09-01')
  })

  it('passes a date-only value straight through', () => {
    expect(toCalendarDate('2026-09-01')).toBe('2026-09-01')
  })

  it('is not affected by the process timezone', () => {
    // The whole bug was timezone sensitivity. There is no Date involved now,
    // so there is nothing left to shift — asserted rather than assumed.
    const prev = process.env['TZ']
    try {
      for (const tz of ['UTC', 'Europe/Stockholm', 'America/New_York', 'Pacific/Kiritimati']) {
        process.env['TZ'] = tz
        expect(toCalendarDate('2026-09-01T00:00:00')).toBe('2026-09-01')
      }
    } finally {
      if (prev === undefined) delete process.env['TZ']
      else process.env['TZ'] = prev
    }
  })

  it('keeps the calendar date of a zoned value by reading it in UTC', () => {
    expect(toCalendarDate('2026-09-01T13:45:00Z')).toBe('2026-09-01')
  })

  it('accepts a Date and renders its UTC calendar date', () => {
    expect(toCalendarDate(new Date('2026-09-01T00:00:00Z'))).toBe('2026-09-01')
  })

  it('returns undefined for absent input rather than a fabricated date', () => {
    expect(toCalendarDate(undefined)).toBeUndefined()
    expect(toCalendarDate(null)).toBeUndefined()
    expect(toCalendarDate('')).toBeUndefined()
    expect(toCalendarDate('   ')).toBeUndefined()
  })

  it('returns undefined for an unparseable value', () => {
    expect(toCalendarDate('not-a-date')).toBeUndefined()
    expect(toCalendarDate('0000-00-00')).toBeUndefined()
  })

  it('emits exactly YYYY-MM-DD, zero-padded', () => {
    expect(toCalendarDate('2026-01-05T00:00:00')).toBe('2026-01-05')
    expect(toCalendarDate('2026-12-31T00:00:00')).toBe('2026-12-31')
  })
})

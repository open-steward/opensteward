import { describe, it, expect } from 'vitest'
import { toUtcDate } from '../../../../../../src/verticals/accounting/adapters/shared/transform'

/**
 * These assertions are timezone-sensitive by design. `vitest.config.ts` does
 * NOT pin TZ, so a bare `new Date(zonelessString)` passes on a UTC CI box and
 * silently corrupts data on any other. Each case therefore runs under an
 * explicit TZ that is not UTC — the shifted case is the whole point.
 */
function underTz<T>(tz: string, fn: () => T): T {
  const prev = process.env['TZ']
  process.env['TZ'] = tz
  try {
    return fn()
  } finally {
    if (prev === undefined) delete process.env['TZ']
    else process.env['TZ'] = prev
  }
}

describe('toUtcDate', () => {
  it('reads a zoneless date-time as UTC, not local time', () => {
    // Xero's `DateString` shape. A calendar date with a fabricated zero time
    // and no zone; `new Date()` treats this as LOCAL, so east of UTC the
    // calendar date moves back a day.
    const d = toUtcDate('2026-09-01T00:00:00')
    expect(d?.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })

  it('keeps the calendar date under a non-UTC process timezone', () => {
    const iso = underTz('Europe/Stockholm', () => toUtcDate('2026-09-01T00:00:00')?.toISOString())
    expect(iso).toBe('2026-09-01T00:00:00.000Z')
  })

  it('keeps the calendar date west of UTC too', () => {
    const iso = underTz('America/New_York', () => toUtcDate('2026-09-01T00:00:00')?.toISOString())
    expect(iso).toBe('2026-09-01T00:00:00.000Z')
  })

  it('leaves a date-only value on UTC midnight', () => {
    expect(toUtcDate('2026-09-01')?.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })

  it('honours an explicit Z', () => {
    expect(toUtcDate('2026-09-01T13:45:00Z')?.toISOString()).toBe('2026-09-01T13:45:00.000Z')
  })

  it('honours an explicit numeric offset rather than re-reading it as UTC', () => {
    expect(toUtcDate('2026-09-01T13:45:00+02:00')?.toISOString()).toBe('2026-09-01T11:45:00.000Z')
  })

  it('honours a compact numeric offset', () => {
    expect(toUtcDate('2026-09-01T13:45:00+0200')?.toISOString()).toBe('2026-09-01T11:45:00.000Z')
  })

  it('carries sub-second precision through', () => {
    expect(toUtcDate('2026-09-01T13:45:00.250')?.toISOString()).toBe('2026-09-01T13:45:00.250Z')
  })

  it('returns undefined for absent input rather than an Invalid Date', () => {
    expect(toUtcDate(undefined)).toBeUndefined()
    expect(toUtcDate(null)).toBeUndefined()
    expect(toUtcDate('')).toBeUndefined()
    expect(toUtcDate('   ')).toBeUndefined()
  })

  it('returns undefined for an unparseable value rather than an Invalid Date', () => {
    // `new Date('not-a-date')` yields an Invalid Date, which `z.date()`
    // rejects at the response boundary — a whole record lost to one bad field.
    expect(toUtcDate('not-a-date')).toBeUndefined()
    expect(toUtcDate('0000-00-00')).toBeUndefined()
  })

  it('accepts a Date through unchanged', () => {
    const d = new Date('2026-09-01T00:00:00Z')
    expect(toUtcDate(d)?.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })
})

/**
 * Microsoft-stack platforms serialise timestamps as `/Date(ms+offset)/` rather
 * than ISO-8601. Xero does this for `UpdatedDateUTC` — which is precisely why
 * it also ships `DateString`/`DueDateString` as ISO companions for the fields
 * it expects you to read.
 *
 * `new Date('/Date(…)/')` is an Invalid Date, so `updatedAt` silently came out
 * absent on every entity after being wired up: the mapper was correct and the
 * parser simply could not read the wire format.
 */
describe('toUtcDate — .NET serialised dates', () => {
  it('parses the /Date(ms)/ form', () => {
    // 1788957862905 = 2026-09-09T… — the epoch millis Xero embeds.
    expect(toUtcDate('/Date(1788957862905)/')?.getTime()).toBe(1788957862905)
  })

  it('parses the /Date(ms+0000)/ form Xero actually sends', () => {
    expect(toUtcDate('/Date(1788957862905+0000)/')?.getTime()).toBe(1788957862905)
  })

  it('treats the trailing offset as presentation, not as a shift', () => {
    // The millis are already absolute UTC; the offset only tells a .NET client
    // which zone to RENDER in. Subtracting it would move the instant.
    const a = toUtcDate('/Date(1788957862905+0000)/')!.getTime()
    const b = toUtcDate('/Date(1788957862905+1300)/')!.getTime()
    expect(b).toBe(a)
  })

  it('handles a negative offset the same way', () => {
    expect(toUtcDate('/Date(1788957862905-0500)/')?.getTime()).toBe(1788957862905)
  })

  it('handles a pre-epoch value', () => {
    expect(toUtcDate('/Date(-86400000)/')?.toISOString()).toBe('1969-12-31T00:00:00.000Z')
  })

  it('still returns undefined for a malformed .NET date', () => {
    expect(toUtcDate('/Date(notanumber)/')).toBeUndefined()
    expect(toUtcDate('/Date()/')).toBeUndefined()
  })

  it('does not mistake ordinary text for one', () => {
    expect(toUtcDate('Date(123)')).toBeUndefined()
  })
})

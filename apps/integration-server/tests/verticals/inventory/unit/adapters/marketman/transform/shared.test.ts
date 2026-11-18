/**
 * MarketMan dates.
 *
 * The collection's "Date format" note: "When receiving date value from the
 * server, it should be parsed as yyyy/mm/dd hh:mm:ss." No zone is given; the
 * fields read with it are named for UTC (CountDateUTC, SentDateUTC,
 * DeliveryDateUTC, DateUTC), and GetToken's example answers
 * `"ExpireDateUTC": "2020/03/05 07:34:01"` under `Date: Thu, 27 Feb 2020
 * 07:34:01 GMT`. `new Date('2023/01/09 11:19:30')` reads that in the host's
 * zone, so these cases run under zones that are not UTC: vitest.config.ts
 * pins TZ=UTC, where the bug and the fix agree.
 *
 * The UTC reading is for the slash form only. The docs' zoneless ISO values
 * are not UTC: the three order `CreatedDate` examples (GetOrdersBySentDate
 * twice, GetOrdersByDeliveryDate once) each sit four hours behind their
 * `CreatedDateUTC` twin, e.g. `"CreatedDate": "2025-02-16T05:28:43.95"` beside
 * `"CreatedDateUTC": "2025/02/16 09:28:43"`. The fourth, a vendor
 * `"DeliveryDate": "2022-09-26T00:00:00"`, has no UTC twin.
 */
import { describe, it, expect } from 'vitest'
import { toIso } from '../../../../../../../src/verticals/inventory/adapters/marketman/transform/shared'

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

const ZONES = ['Asia/Tokyo', 'America/New_York', 'UTC']

describe('marketman toIso', () => {
  it.each(ZONES)('reads the documented "yyyy/mm/dd hh:mm:ss" as UTC under %s', (tz) => {
    // GetInventoryCounts' example: "CountDateUTC": "2023/01/09 11:19:30".
    expect(underTz(tz, () => toIso('2023/01/09 11:19:30'))).toBe('2023-01-09T11:19:30.000Z')
  })

  it("makes no UTC claim for a zoneless ISO date-time: the docs' CreatedDate examples are not UTC", () => {
    // Left to `new Date`, as before: Asia/Tokyo is UTC+9 all year.
    expect(underTz('Asia/Tokyo', () => toIso('2023-01-09T11:19:30'))).toBe(
      '2023-01-09T02:19:30.000Z',
    )
  })

  it('reads a bare date as UTC midnight', () => {
    expect(underTz('Asia/Tokyo', () => toIso('2023/01/09'))).toBe('2023-01-09T00:00:00.000Z')
  })

  it('reads a padded wire date as UTC too, not in the host zone', () => {
    expect(underTz('Asia/Tokyo', () => toIso(' 2023/01/09 11:19:30 '))).toBe(
      '2023-01-09T11:19:30.000Z',
    )
  })

  it('carries fractional seconds', () => {
    expect(toIso('2023/01/09 11:19:30.25')).toBe('2023-01-09T11:19:30.250Z')
  })

  it('keeps a zone the value states itself', () => {
    expect(toIso('2023-01-09T11:19:30Z')).toBe('2023-01-09T11:19:30.000Z')
    expect(toIso('2023-01-09T11:19:30+02:00')).toBe('2023-01-09T09:19:30.000Z')
  })

  it('refuses a date that does not exist rather than rolling it over', () => {
    expect(toIso('2023/02/30 00:00:00')).toBeUndefined()
  })

  it('returns undefined for nothing, blanks and garbage', () => {
    expect(toIso(null)).toBeUndefined()
    expect(toIso(undefined)).toBeUndefined()
    expect(toIso('')).toBeUndefined()
    expect(toIso('   ')).toBeUndefined()
    expect(toIso('not a date')).toBeUndefined()
  })
})

import { describe, it, expect } from 'vitest'
import { parseTallyDate } from '../../../../../../../src/verticals/accounting/adapters/tallyprime/transform/shared'
import { transformBill } from '../../../../../../../src/verticals/accounting/adapters/tallyprime/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'

/**
 * TallyPrime emits `<DATE>` as `YYYYMMDD` with no separators — "All dates must
 * follow the YYYYMMDD format", per Tally's own XML documentation, and the same
 * form is required on import.
 *
 * JavaScript cannot parse it:
 *
 *     new Date('20260915') -> Invalid Date
 *
 * Every transform did `new Date(raw.DATE)` and guarded with
 * `isNaN(getTime())`, so the date became `undefined` instead of raising. The
 * guard is what made it silent: every voucher date was dropped and nothing
 * failed, which is exactly the predicted failure if assumption 3
 * were wrong.
 */

describe('parseTallyDate', () => {
  it('parses the documented YYYYMMDD form', () => {
    expect(parseTallyDate('20260915')?.toISOString()).toBe('2026-09-15T00:00:00.000Z')
  })

  it('anchors a calendar date at UTC midnight, not local', () => {
    // Reading a posting date in local time moves it to the previous day for
    // every deployment west of UTC — invisible on a UTC CI box.
    const d = parseTallyDate('20260101')
    expect(d?.getUTCFullYear()).toBe(2026)
    expect(d?.getUTCMonth()).toBe(0)
    expect(d?.getUTCDate()).toBe(1)
    expect(d?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('still accepts an ISO calendar date, for a gateway that emits one', () => {
    expect(parseTallyDate('2026-09-15')?.toISOString()).toBe('2026-09-15T00:00:00.000Z')
  })

  it('rejects an impossible date rather than rolling it forward', () => {
    // `new Date(Date.UTC(2026, 1, 30))` silently becomes 2 March.
    expect(parseTallyDate('20260230')).toBeUndefined()
    expect(parseTallyDate('20261301')).toBeUndefined()
  })

  it('returns undefined for absent or unparseable input', () => {
    expect(parseTallyDate(undefined)).toBeUndefined()
    expect(parseTallyDate('')).toBeUndefined()
    expect(parseTallyDate('   ')).toBeUndefined()
    expect(parseTallyDate('not a date')).toBeUndefined()
  })
})

describe('tallyprime transforms read the real date format', () => {
  it('keeps a voucher date instead of dropping it', () => {
    const bill = transformBill({
      GUID: 'g1',
      MASTERID: '1',
      VOUCHERNUMBER: 'V-1',
      DATE: '20260915',
      AMOUNT: '1250.00',
    } as never)
    // Before the fix this was undefined, for every voucher.
    expect(bill.postedAt).toEqual(new Date('2026-09-15T00:00:00.000Z'))
    expect(() => BillSchema.parse(bill)).not.toThrow()
  })
})

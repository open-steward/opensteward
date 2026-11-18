import { describe, it, expect } from 'vitest'
import { toIsoDatetime } from '@opensteward/shared'
import {
  mapListStatus,
  paytmToIso,
  toPaytmDateTime,
} from '../../../../../../../src/verticals/payments/adapters/paytm/transform/shared'

describe('paytmToIso', () => {
  it('pins both space- and T-separated offset-less input to the same IST-derived instant', () => {
    // `paytmToIso` pins the +05:30 (IST) offset before handing off to
    // `toIsoDatetime` — chain through it here exactly as every call site
    // (charge.ts, refund.ts) does, so this pins the actual instant that
    // reaches the canonical schema, not just the intermediate string.
    //
    // A guard that keys on the T separator would skip the IST pin for
    // T-separated offset-less input; both separators must resolve to the
    // identical instant.
    expect(toIsoDatetime(paytmToIso('2020-05-05 14:00:28'))).toBe('2020-05-05T08:30:28.000Z')
    expect(toIsoDatetime(paytmToIso('2020-05-05T14:00:28'))).toBe('2020-05-05T08:30:28.000Z')
  })

  it('leaves an input that already carries an offset or Z untouched', () => {
    expect(paytmToIso('2020-05-05T14:00:28Z')).toBe('2020-05-05T14:00:28Z')
    expect(paytmToIso('2020-05-05T14:00:28+05:30')).toBe('2020-05-05T14:00:28+05:30')
  })

  it('returns undefined for empty/blank/nullish input', () => {
    expect(paytmToIso(undefined)).toBeUndefined()
    expect(paytmToIso(null)).toBeUndefined()
    expect(paytmToIso('')).toBeUndefined()
    expect(paytmToIso('   ')).toBeUndefined()
  })
})

describe('toPaytmDateTime', () => {
  it('formats a UTC instant as the documented +05:30 (IST) date-range shape — the inverse of paytmToIso', () => {
    // 2026-01-01T00:00:00Z is 2026-01-01 05:30:00 IST.
    expect(toPaytmDateTime(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01T05:30:00+05:30')
    // Round-trips through paytmToIso/toIsoDatetime back to the same instant.
    const formatted = toPaytmDateTime(new Date('2026-01-01T00:00:00Z'))
    const bare = formatted.replace('+05:30', '')
    expect(toIsoDatetime(paytmToIso(bare))).toBe('2026-01-01T00:00:00.000Z')
  })

  it('carries the date across the UTC day boundary into IST (UTC 19:00 → next-day 00:30 IST)', () => {
    expect(toPaytmDateTime(new Date('2026-01-01T19:00:00Z'))).toBe('2026-01-02T00:30:00+05:30')
  })

  it('zero-pads every component', () => {
    expect(toPaytmDateTime(new Date('2026-03-04T01:02:03Z'))).toBe('2026-03-04T06:32:03+05:30')
  })
})

describe('mapListStatus', () => {
  it('maps SUCCESS/FAILURE/PENDING (case-insensitively) to the canonical statuses', () => {
    expect(mapListStatus('SUCCESS')).toBe('succeeded')
    expect(mapListStatus('success')).toBe('succeeded')
    expect(mapListStatus('FAILURE')).toBe('failed')
    expect(mapListStatus('PENDING')).toBe('pending')
  })

  it('maps an unmapped or missing status to "unknown" rather than guessing', () => {
    expect(mapListStatus('TXN_SUCCESS')).toBe('unknown') // the OTHER (resultInfo) vocabulary, not this one
    expect(mapListStatus(undefined)).toBe('unknown')
    expect(mapListStatus(null)).toBe('unknown')
    expect(mapListStatus('')).toBe('unknown')
  })
})

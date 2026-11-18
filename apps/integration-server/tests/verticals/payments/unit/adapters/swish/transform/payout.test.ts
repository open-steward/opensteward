import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawSwishPayout,
} from '../../../../../../../src/verticals/payments/adapters/swish/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

function makeRaw(overrides: RawSwishPayout = {}): RawSwishPayout {
  return {
    payoutInstructionUUID: 'uuid-payout-001',
    amount: 250.0,
    currency: 'SEK',
    status: 'PAID',
    dateCreated: '2026-01-15T09:30:00Z',
    ...overrides,
  }
}

describe('transformPayout (swish)', () => {
  it('uses payoutInstructionUUID as id when present', () => {
    expect(transformPayout(makeRaw()).id).toBe('uuid-payout-001')
  })

  it('falls back to id when payoutInstructionUUID is absent', () => {
    expect(
      transformPayout(makeRaw({ payoutInstructionUUID: undefined, id: 'po-fallback' })).id,
    ).toBe('po-fallback')
  })

  it('converts amount to minor units (250.00 → 25000)', () => {
    expect(transformPayout(makeRaw({ amount: 250.0 })).amount).toBe(25000)
  })

  it('uppercases currency and defaults to SEK when missing', () => {
    expect(transformPayout(makeRaw({ currency: 'sek' })).currency).toBe('SEK')
    expect(transformPayout(makeRaw({ currency: undefined })).currency).toBe('SEK')
  })

  it('sets gateway to swish', () => {
    expect(transformPayout(makeRaw()).gateway).toBe('swish')
  })

  describe('status mapping', () => {
    it.each([
      ['PAID', 'paid'],
      ['PAID_OUT', 'paid'],
      ['COMPLETED', 'paid'],
      ['SUCCESS', 'paid'],
      ['successful', 'paid'],
    ])('%s → paid', (raw, expected) => {
      expect(transformPayout(makeRaw({ status: raw })).status).toBe(expected)
    })

    it.each([
      ['DEBITED', 'in_transit'],
      ['IN_TRANSIT', 'in_transit'],
      ['PROCESSING', 'in_transit'],
    ])('%s → in_transit', (raw, expected) => {
      expect(transformPayout(makeRaw({ status: raw })).status).toBe(expected)
    })

    it('FAILED → failed', () => {
      expect(transformPayout(makeRaw({ status: 'FAILED' })).status).toBe('failed')
    })

    it('CANCELLED → cancelled', () => {
      expect(transformPayout(makeRaw({ status: 'CANCELLED' })).status).toBe('cancelled')
    })

    it('unknown status → pending', () => {
      expect(transformPayout(makeRaw({ status: 'SOME_UNKNOWN' })).status).toBe('pending')
    })
  })

  it('passes schema validation', () => {
    const result = PayoutSchema.safeParse(transformPayout(makeRaw()))
    expect(result.success).toBe(true)
  })
})

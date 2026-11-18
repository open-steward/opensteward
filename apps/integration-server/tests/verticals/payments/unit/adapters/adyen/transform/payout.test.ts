import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawAdyenPayout,
} from '../../../../../../../src/verticals/payments/adapters/adyen/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('adyen transformPayout', () => {
  it('maps a completed payout to status "paid"', () => {
    const raw: RawAdyenPayout = {
      pspReference: 'PO-001',
      status: { statusCode: 'completed' },
      amount: { value: 10000, currency: 'usd' },
      reference: 'REF-PAYOUT-001',
      creationDate: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('PO-001')
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('USD')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.gateway).toBe('adyen')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a pending payout to status "pending"', () => {
    const raw: RawAdyenPayout = {
      pspReference: 'PO-002',
      status: { statusCode: 'pending' },
      amount: { value: 5000, currency: 'eur' },
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('EUR')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a declined payout to status "failed"', () => {
    const raw: RawAdyenPayout = {
      pspReference: 'PO-003',
      status: { statusCode: 'declined' },
      amount: { value: 2500, currency: 'gbp' },
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})

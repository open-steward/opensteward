import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawGCPayout,
} from '../../../../../../../src/verticals/payments/adapters/gocardless/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('gocardless transformPayout', () => {
  it('maps a paid payout to status "paid"', () => {
    const raw: RawGCPayout = {
      id: 'PO001',
      amount: 50000,
      currency: 'gbp',
      status: 'paid',
      arrival_date: '2024-02-10T00:00:00Z',
      reference: 'PAYOUT-REF-001',
      payout_type: 'merchant',
      created_at: '2024-02-08T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('PO001')
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('GBP')
    expect(result.arrivalDate).toBe('2024-02-10T00:00:00Z')
    expect(result.gateway).toBe('gocardless')
    expect(result.metadata.reference).toBe('PAYOUT-REF-001')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a pending payout to status "pending"', () => {
    const raw: RawGCPayout = {
      id: 'PO002',
      amount: 25000,
      currency: 'eur',
      status: 'pending',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('EUR')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a bounced payout to status "failed"', () => {
    const raw: RawGCPayout = {
      id: 'PO003',
      amount: 10000,
      currency: 'gbp',
      status: 'bounced',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})

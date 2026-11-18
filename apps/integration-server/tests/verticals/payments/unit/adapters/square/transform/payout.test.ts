import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawSquarePayout,
} from '../../../../../../../src/verticals/payments/adapters/square/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('square transformPayout', () => {
  it('maps a PAID payout', () => {
    const raw: RawSquarePayout = {
      id: 'SQ-PYT-001',
      status: 'PAID',
      amount_money: { amount: 15000, currency: 'USD' },
      arrival_date: '2024-06-10T00:00:00Z',
      destination: { type: 'BANK_ACCOUNT', id: 'bank-001' },
      created_at: '2024-06-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('SQ-PYT-001')
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(15000)
    expect(result.currency).toBe('USD')
    expect(result.arrivalDate).toBe('2024-06-10T00:00:00Z')
    expect(result.gateway).toBe('square')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a SENT payout to "in_transit"', () => {
    const raw: RawSquarePayout = {
      id: 'SQ-PYT-002',
      status: 'SENT',
      amount_money: { amount: 5000, currency: 'EUR' },
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('in_transit')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a FAILED payout', () => {
    const raw: RawSquarePayout = {
      id: 'SQ-PYT-003',
      status: 'FAILED',
      amount_money: { amount: 1000, currency: 'GBP' },
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})

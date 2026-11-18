import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawScalapayPayout,
} from '../../../../../../../src/verticals/payments/adapters/scalapay/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('scalapay transformPayout', () => {
  it('maps a PAID payout correctly', () => {
    const raw: RawScalapayPayout = {
      token: 'pay-tok-001',
      status: 'PAID',
      totalAmount: { amount: '1250.00', currency: 'EUR' },
      payoutDate: '2024-03-05T00:00:00Z',
      reference: 'PAYOUT-REF-001',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('pay-tok-001')
    expect(result.externalId).toBe('pay-tok-001')
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(125000)
    expect(result.currency).toBe('EUR')
    expect(result.gateway).toBe('scalapay')
    expect(result.statementDescriptor).toBe('PAYOUT-REF-001')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING payout correctly', () => {
    const raw: RawScalapayPayout = {
      token: 'pay-tok-002',
      status: 'PENDING',
      totalAmount: { amount: '500.00', currency: 'EUR' },
      payoutDate: '2024-03-10T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps an IN_TRANSIT payout correctly', () => {
    const raw: RawScalapayPayout = {
      token: 'pay-tok-003',
      status: 'IN_TRANSIT',
      amount: { amount: '300.00', currency: 'EUR' },
      payoutDate: '2024-03-08T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('in_transit')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps absent status to paid (settled reporting list convention)', () => {
    const raw: RawScalapayPayout = {
      payoutToken: 'pay-tok-004',
      totalAmount: { amount: '200.00', currency: 'EUR' },
      settlementDate: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('pay-tok-004')
    expect(result.status).toBe('paid')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})

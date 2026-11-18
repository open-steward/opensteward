import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawCheckoutPayout,
} from '../../../../../../../src/verticals/payments/adapters/checkout-com/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('checkout-com transformPayout', () => {
  it('maps a paid payout to status "paid"', () => {
    const raw: RawCheckoutPayout = {
      id: 'po_001',
      status: 'paid',
      amount: 50000,
      currency: 'usd',
      scheduled_on: '2024-02-15T00:00:00Z',
      reference: 'PAYOUT-REF-001',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('po_001')
    expect(result.status).toBe('paid')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('USD')
    expect(result.arrivalDate).toBe('2024-02-15T00:00:00Z')
    expect(result.gateway).toBe('checkout-com')
    expect(result.metadata.reference).toBe('PAYOUT-REF-001')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a completed payout to status "paid"', () => {
    const raw: RawCheckoutPayout = {
      id: 'po_002',
      status: 'completed',
      amount: 25000,
      currency: 'eur',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('paid')
    expect(result.currency).toBe('EUR')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps an in_transit payout to status "in_transit"', () => {
    const raw: RawCheckoutPayout = {
      id: 'po_003',
      status: 'in_transit',
      amount: 15000,
      currency: 'gbp',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('in_transit')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a failed payout to status "failed"', () => {
    const raw: RawCheckoutPayout = {
      id: 'po_004',
      status: 'failed',
      amount: 8000,
      currency: 'usd',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('failed')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled payout to status "cancelled"', () => {
    const raw: RawCheckoutPayout = {
      id: 'po_005',
      status: 'cancelled',
      amount: 5000,
      currency: 'usd',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('cancelled')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('defaults unknown status to "pending"', () => {
    const raw: RawCheckoutPayout = {
      id: 'po_006',
      status: 'processing',
      amount: 12000,
      currency: 'usd',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})

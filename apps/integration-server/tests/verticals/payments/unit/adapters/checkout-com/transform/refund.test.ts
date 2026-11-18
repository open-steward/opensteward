import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawCheckoutRefund,
} from '../../../../../../../src/verticals/payments/adapters/checkout-com/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('checkout-com transformRefund', () => {
  it('maps a refund action to canonical Refund', () => {
    const raw: RawCheckoutRefund = {
      action_id: 'act_rfnd_001',
      reference: 'REFUND-REF-001',
      amount: 2000,
      currency: 'usd',
      payment_id: 'pay_001',
      processed_on: '2024-03-10T14:30:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('act_rfnd_001')
    expect(result.externalId).toBe('act_rfnd_001')
    expect(result.chargeId).toBe('pay_001')
    expect(result.amount).toBe(2000)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('checkout-com')
    expect(result.metadata.reference).toBe('REFUND-REF-001')
    expect(result.createdAt).toBe('2024-03-10T14:30:00Z')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('always returns status "succeeded"', () => {
    const raw: RawCheckoutRefund = {
      action_id: 'act_rfnd_002',
      amount: 500,
      currency: 'eur',
      payment_id: 'pay_002',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.currency).toBe('EUR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('uses action_id as both id and externalId', () => {
    const raw: RawCheckoutRefund = {
      action_id: 'act_rfnd_003',
      amount: 750,
      currency: 'gbp',
      payment_id: 'pay_003',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('act_rfnd_003')
    expect(result.externalId).toBe('act_rfnd_003')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

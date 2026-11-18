import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawStripeRefund,
} from '../../../../../../../src/verticals/payments/adapters/truelayer/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('truelayer transformRefund', () => {
  it('maps a succeeded refund with chargeId', () => {
    const raw: RawStripeRefund = {
      id: 're_tl_001',
      object: 'refund',
      amount: 5000,
      currency: 'usd',
      status: 'succeeded',
      charge: 'ch_tl_001',
      created: 1709251200,
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('re_tl_001')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.chargeId).toBe('ch_tl_001')
    expect(result.gateway).toBe('stripe')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a pending refund', () => {
    const raw: RawStripeRefund = {
      id: 're_tl_002',
      object: 'refund',
      amount: 2500,
      currency: 'eur',
      status: 'pending',
      charge: 'ch_tl_002',
      created: 1709337600,
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled refund', () => {
    const raw: RawStripeRefund = {
      id: 're_tl_003',
      object: 'refund',
      amount: 1500,
      currency: 'gbp',
      status: 'canceled',
      charge: 'ch_tl_003',
      created: 1709424000,
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawStripeRefund,
} from '../../../../../../../src/verticals/payments/adapters/tyro/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('tyro transformRefund', () => {
  it('maps a succeeded refund with chargeId and currency', () => {
    const raw: RawStripeRefund = {
      id: 're_tyro_001',
      object: 'refund',
      amount: 5000,
      currency: 'aud',
      status: 'succeeded',
      charge: 'ch_tyro_001',
      created: 1709251200,
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('re_tyro_001')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('AUD')
    expect(result.status).toBe('succeeded')
    expect(result.chargeId).toBe('ch_tyro_001')
    expect(result.gateway).toBe('stripe')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a pending refund', () => {
    const raw: RawStripeRefund = {
      id: 're_tyro_002',
      object: 'refund',
      amount: 2500,
      currency: 'aud',
      status: 'pending',
      charge: 'ch_tyro_002',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled (canceled) refund', () => {
    const raw: RawStripeRefund = {
      id: 're_tyro_003',
      object: 'refund',
      amount: 1000,
      currency: 'aud',
      status: 'canceled',
      charge: 'ch_tyro_003',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

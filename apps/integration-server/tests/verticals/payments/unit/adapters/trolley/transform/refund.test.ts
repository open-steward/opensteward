import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawTrolleyRefund,
} from '../../../../../../../src/verticals/payments/adapters/trolley/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('trolley transformRefund', () => {
  it('maps a completed refund and links it to its payment', () => {
    const raw: RawTrolleyRefund = {
      id: 'ref_trolley_001',
      paymentId: 'pay_trolley_001',
      status: 'completed',
      amount: '25.00',
      currency: 'usd',
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('ref_trolley_001')
    expect(result.chargeId).toBe('pay_trolley_001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('trolley')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a pending refund', () => {
    const raw: RawTrolleyRefund = {
      id: 'ref_trolley_002',
      paymentId: 'pay_trolley_002',
      status: 'pending',
      amount: '10.00',
      currency: 'EUR',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(result.chargeId).toBe('pay_trolley_002')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund', () => {
    const raw: RawTrolleyRefund = {
      id: 'ref_trolley_003',
      paymentId: 'pay_trolley_003',
      status: 'failed',
      amount: '5.00',
      currency: 'GBP',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

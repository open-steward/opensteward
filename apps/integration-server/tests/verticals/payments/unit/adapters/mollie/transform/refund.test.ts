import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawMollieRefund,
} from '../../../../../../../src/verticals/payments/adapters/mollie/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('mollie transformRefund', () => {
  it('maps a refunded refund with decimal amount to minor units', () => {
    const raw: RawMollieRefund = {
      id: 're_1',
      paymentId: 'tr_abc',
      amount: { value: '12.50', currency: 'EUR' },
      status: 'refunded',
      description: 'Customer return',
      createdAt: '2023-11-01T00:00:00+00:00',
      metadata: { reason: 'defective' },
    }
    const result = transformRefund(raw)

    expect(result.id).toBe('re_1')
    expect(result.chargeId).toBe('tr_abc')
    expect(result.amount).toBe(1250)
    expect(result.currency).toBe('EUR')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('mollie')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps processing status to pending', () => {
    const raw: RawMollieRefund = {
      id: 're_2',
      paymentId: 'tr_xyz',
      amount: { value: '5.00', currency: 'EUR' },
      status: 'processing',
      createdAt: '2023-11-01T00:00:00+00:00',
    }
    const result = transformRefund(raw)

    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps failed status', () => {
    const raw: RawMollieRefund = {
      id: 're_3',
      paymentId: 'tr_def',
      amount: { value: '3.00', currency: 'EUR' },
      status: 'failed',
      createdAt: '2023-11-01T00:00:00+00:00',
    }
    const result = transformRefund(raw)

    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

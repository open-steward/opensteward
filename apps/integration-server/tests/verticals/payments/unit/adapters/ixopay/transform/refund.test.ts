import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawIxopayRefund,
} from '../../../../../../../src/verticals/payments/adapters/ixopay/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('ixopay transformRefund', () => {
  it('maps transactionStatus FINISHED to "succeeded" and links chargeId', () => {
    const raw: RawIxopayRefund = {
      uuid: 'ref-uuid-001',
      referenceId: 'orig-uuid-001',
      transactionStatus: 'FINISHED',
      amount: '10.00',
      currency: 'EUR',
      returnData: { createdAt: '2024-03-01T00:00:00Z' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.chargeId).toBe('orig-uuid-001')
    expect(result.amount).toBe(1000)
    expect(result.gateway).toBe('ixopay')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps transactionStatus ERROR to "failed" and captures error message', () => {
    const raw: RawIxopayRefund = {
      uuid: 'ref-uuid-002',
      referenceId: 'orig-uuid-002',
      transactionStatus: 'ERROR',
      amount: '5.00',
      currency: 'USD',
      errors: [{ adapterMessage: 'Refund not allowed', message: 'error' }],
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Refund not allowed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps transactionStatus PENDING to "pending"', () => {
    const raw: RawIxopayRefund = {
      uuid: 'ref-uuid-003',
      referenceId: 'orig-uuid-003',
      transactionStatus: 'PENDING',
      amount: '3.00',
      currency: 'GBP',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('GBP')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to returnType when transactionStatus is absent', () => {
    const raw: RawIxopayRefund = {
      uuid: 'ref-uuid-004',
      referenceId: 'orig-uuid-004',
      returnType: 'FINISHED',
      success: true,
      amount: '7.50',
      currency: 'EUR',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

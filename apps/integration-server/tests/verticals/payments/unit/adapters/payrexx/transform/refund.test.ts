import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawPayrexxRefund,
} from '../../../../../../../src/verticals/payments/adapters/payrexx/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('payrexx transformRefund', () => {
  it('maps a succeeded refund', () => {
    const raw: RawPayrexxRefund = {
      id: 'refund_001',
      referenceId: 'txn_42',
      amount: 5000,
      currency: 'CHF',
      status: 'success',
      time: '2024-03-01T00:00:00Z',
    }

    const result = transformRefund(raw)

    expect(result.id).toBe('refund_001')
    expect(result.chargeId).toBe('txn_42')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('CHF')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('payrexx')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps "completed" status to "succeeded"', () => {
    const raw: RawPayrexxRefund = {
      id: 'refund_002',
      referenceId: 'txn_99',
      amount: 2000,
      currency: 'EUR',
      status: 'completed',
    }

    const result = transformRefund(raw)

    expect(result.status).toBe('succeeded')
    expect(result.currency).toBe('EUR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund', () => {
    const raw: RawPayrexxRefund = {
      id: 'refund_003',
      referenceId: 'txn_77',
      amount: 1000,
      currency: 'CHF',
      status: 'failed',
    }

    const result = transformRefund(raw)

    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('uses CHF fallback when no currency provided', () => {
    const raw: RawPayrexxRefund = {
      id: 'refund_004',
      referenceId: 'txn_55',
      amount: 500,
      status: 'pending',
    }

    const result = transformRefund(raw)

    expect(result.currency).toBe('CHF')
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

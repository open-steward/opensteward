import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawUnzerCancel,
} from '../../../../../../../src/verticals/payments/adapters/unzer/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('unzer transformRefund', () => {
  it('maps a successful cancel to status "succeeded"', () => {
    const raw: RawUnzerCancel = {
      id: 's-cnl-001',
      amount: '50.00',
      currency: 'EUR',
      date: '2024-03-10 14:00:00',
      isSuccess: true,
      resources: {
        paymentId: 's-pay-001',
      },
      processing: {
        uniqueId: 'uniq-001',
        shortId: 'short-001',
      },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('EUR')
    expect(result.chargeId).toBe('s-pay-001')
    expect(result.gateway).toBe('unzer')
    expect(result.id).toBe('s-cnl-001')
    expect(result.externalId).toBe('s-cnl-001')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a pending cancel to status "pending"', () => {
    const raw: RawUnzerCancel = {
      id: 's-cnl-002',
      amount: '25.00',
      currency: 'USD',
      isPending: true,
      resources: { paymentId: 's-pay-002' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps an error cancel to status "failed" with failure reason', () => {
    const raw: RawUnzerCancel = {
      id: 's-cnl-003',
      amount: '10.00',
      currency: 'EUR',
      isError: true,
      message: { merchant: 'Refund window expired', customer: 'Cannot process refund' },
      resources: { paymentId: 's-pay-003' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Refund window expired')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to customer message when merchant message is absent', () => {
    const raw: RawUnzerCancel = {
      id: 's-cnl-004',
      amount: '10.00',
      currency: 'EUR',
      isError: true,
      message: { customer: 'Customer-facing error' },
      resources: { paymentId: 's-pay-004' },
    }
    const result = transformRefund(raw)
    expect(result.failureReason).toBe('Customer-facing error')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('handles missing currency by defaulting to EUR', () => {
    const raw: RawUnzerCancel = {
      id: 's-cnl-005',
      amount: '20.00',
      isSuccess: true,
      resources: { paymentId: 's-pay-005' },
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('EUR')
    expect(result.amount).toBe(2000)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults to "pending" when no flags are set', () => {
    const raw: RawUnzerCancel = {
      id: 's-cnl-006',
      amount: '5.00',
      currency: 'GBP',
      resources: { paymentId: 's-pay-006' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(500)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('includes processing metadata in result', () => {
    const raw: RawUnzerCancel = {
      id: 's-cnl-007',
      amount: '100.00',
      currency: 'EUR',
      isSuccess: true,
      resources: { paymentId: 's-pay-007' },
      processing: { shortId: 'sh-007', uniqueId: 'un-007' },
    }
    const result = transformRefund(raw)
    expect(result.metadata.shortId).toBe('sh-007')
    expect(result.metadata.uniqueId).toBe('un-007')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

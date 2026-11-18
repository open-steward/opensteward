import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawWorldlineRefund,
} from '../../../../../../../src/verticals/payments/adapters/worldline/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('worldline transformRefund', () => {
  it('maps REFUNDED status to "succeeded" and derives chargeId by stripping sequence suffix', () => {
    const raw: RawWorldlineRefund = {
      id: 'wl-pay-001_0',
      status: 'REFUNDED',
      refundOutput: {
        amountOfMoney: { amount: 5000, currencyCode: 'EUR' },
        references: { merchantReference: 'mref-r1', paymentReference: 'pref-r1' },
        paymentMethod: 'card',
      },
      statusOutput: {
        statusCode: 7,
        statusCodeChangeDateTime: '20240301000000',
      },
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('wl-pay-001_0')
    expect(result.chargeId).toBe('wl-pay-001')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('EUR')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('worldline')
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps REJECTED status to "failed"', () => {
    const raw: RawWorldlineRefund = {
      id: 'wl-pay-002_0',
      status: 'REJECTED',
      refundOutput: {
        amountOfMoney: { amount: 1000, currencyCode: 'USD' },
      },
    }
    const result = transformRefund(raw)
    expect(result.chargeId).toBe('wl-pay-002')
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps CANCELLED status to "cancelled"', () => {
    const raw: RawWorldlineRefund = {
      id: 'wl-pay-003_1',
      status: 'CANCELLED',
      refundOutput: {
        amountOfMoney: { amount: 2500, currencyCode: 'GBP' },
      },
    }
    const result = transformRefund(raw)
    expect(result.chargeId).toBe('wl-pay-003')
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps PENDING_APPROVAL status to "pending"', () => {
    const raw: RawWorldlineRefund = {
      id: 'wl-pay-004_0',
      status: 'PENDING_APPROVAL',
      refundOutput: {
        amountOfMoney: { amount: 800, currencyCode: 'EUR' },
      },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to EUR when currencyCode is absent', () => {
    const raw: RawWorldlineRefund = {
      id: 'wl-pay-005_0',
      status: 'REFUNDED',
      refundOutput: {
        amountOfMoney: { amount: 300 },
      },
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('EUR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('preserves original id when no underscore suffix is present', () => {
    const raw: RawWorldlineRefund = {
      id: 'simple-refund-id',
      status: 'CAPTURED',
      refundOutput: {
        amountOfMoney: { amount: 100, currencyCode: 'EUR' },
      },
    }
    const result = transformRefund(raw)
    expect(result.chargeId).toBe('simple-refund-id')
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

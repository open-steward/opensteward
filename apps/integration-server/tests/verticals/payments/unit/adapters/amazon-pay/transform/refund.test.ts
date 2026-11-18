import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawAmazonPayRefund,
} from '../../../../../../../src/verticals/payments/adapters/amazon-pay/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('amazon-pay transformRefund', () => {
  it('maps a Refunded refund to succeeded status', () => {
    const raw: RawAmazonPayRefund = {
      refundId: 'R-001',
      chargeId: 'C-001',
      refundAmount: { amount: '14.00', currencyCode: 'USD' },
      statusDetails: {
        state: 'Refunded',
        lastUpdatedTimestamp: '2024-03-01T00:00:00Z',
      },
      creationTimestamp: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)

    expect(result.id).toBe('R-001')
    expect(result.chargeId).toBe('C-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(1400)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('amazon-pay')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a RefundInitiated refund to pending status', () => {
    const raw: RawAmazonPayRefund = {
      refundId: 'R-002',
      chargeId: 'C-002',
      refundAmount: { amount: '5.50', currencyCode: 'EUR' },
      statusDetails: { state: 'RefundInitiated' },
    }
    const result = transformRefund(raw)

    expect(result.status).toBe('pending')
    expect(result.amount).toBe(550)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a Declined refund to failed status with failure reason', () => {
    const raw: RawAmazonPayRefund = {
      refundId: 'R-003',
      chargeId: 'C-003',
      refundAmount: { amount: '20.00', currencyCode: 'GBP' },
      statusDetails: {
        state: 'Declined',
        reasonCode: 'ProcessingFailure',
        reasonDescription: 'Unable to process refund.',
      },
    }
    const result = transformRefund(raw)

    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Unable to process refund.')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('handles zero-decimal JPY amounts correctly', () => {
    const raw: RawAmazonPayRefund = {
      refundId: 'R-004',
      chargeId: 'C-004',
      refundAmount: { amount: '1000', currencyCode: 'JPY' },
      statusDetails: { state: 'Refunded' },
    }
    const result = transformRefund(raw)

    // JPY has 0 decimal places: 1000 JPY → 1000 minor units (no scaling)
    expect(result.amount).toBe(1000)
    expect(result.currency).toBe('JPY')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

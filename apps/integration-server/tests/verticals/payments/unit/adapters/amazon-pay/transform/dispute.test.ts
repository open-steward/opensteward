import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawAmazonPayDispute,
} from '../../../../../../../src/verticals/payments/adapters/amazon-pay/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('amazon-pay transformDispute', () => {
  it('maps an UnderReview dispute to under_review status with fraudulent reason', () => {
    const raw: RawAmazonPayDispute = {
      disputeId: 'D-001',
      chargeId: 'C-001',
      disputeAmount: { amount: '99.99', currencyCode: 'USD' },
      filingReason: 'Fraudulent',
      filingTimestamp: '2024-03-01T00:00:00Z',
      statusDetails: {
        state: 'UnderReview',
        lastUpdatedTimestamp: '2024-03-01T00:00:00Z',
      },
    }
    const result = transformDispute(raw)

    expect(result.id).toBe('D-001')
    expect(result.chargeId).toBe('C-001')
    expect(result.status).toBe('under_review')
    expect(result.reason).toBe('fraudulent')
    expect(result.amount).toBe(9999)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('amazon-pay')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a Resolved/MerchantWon dispute to won status', () => {
    const raw: RawAmazonPayDispute = {
      disputeId: 'D-002',
      chargeId: 'C-002',
      disputeAmount: { amount: '50.00', currencyCode: 'EUR' },
      filingReason: 'ProductNotReceived',
      statusDetails: {
        state: 'Resolved',
        resolution: 'MerchantWon',
      },
    }
    const result = transformDispute(raw)

    expect(result.status).toBe('won')
    expect(result.reason).toBe('product_not_received')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a Closed/BuyerWon dispute to lost status', () => {
    const raw: RawAmazonPayDispute = {
      disputeId: 'D-003',
      chargeId: 'C-003',
      disputeAmount: { amount: '25.00', currencyCode: 'USD' },
      filingReason: 'Duplicate',
      statusDetails: {
        state: 'Closed',
        resolution: 'BuyerWon',
      },
    }
    const result = transformDispute(raw)

    expect(result.status).toBe('lost')
    expect(result.reason).toBe('duplicate')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps ActionRequired dispute to needs_response', () => {
    const raw: RawAmazonPayDispute = {
      disputeId: 'D-004',
      chargeId: 'C-004',
      disputeAmount: { amount: '30.00', currencyCode: 'GBP' },
      statusDetails: { state: 'ActionRequired' },
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('needs_response')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})

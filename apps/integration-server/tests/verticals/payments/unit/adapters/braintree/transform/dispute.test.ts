import { describe, it, expect } from 'vitest'
import {
  transformDispute,
  type RawBraintreeDispute,
} from '../../../../../../../src/verticals/payments/adapters/braintree/transform/dispute'
import { DisputeSchema } from '../../../../../../../src/verticals/payments/schema/dispute'

describe('braintree transformDispute', () => {
  it('maps an OPEN fraud dispute to needs_response with fraudulent reason', () => {
    const raw: RawBraintreeDispute = {
      id: 'disp_001',
      status: 'OPEN',
      reason: 'FRAUD',
      amountDisputed: { value: '99.99', currencyIsoCode: 'USD' },
      transaction: { id: 'txn_001' },
      receivedDate: '2024-03-01T00:00:00Z',
      replyByDate: '2024-03-15T00:00:00Z',
    }
    const result = transformDispute(raw)
    expect(result.id).toBe('disp_001')
    expect(result.chargeId).toBe('txn_001')
    expect(result.status).toBe('needs_response')
    expect(result.reason).toBe('fraudulent')
    expect(result.amount).toBe(9999)
    expect(result.currency).toBe('USD')
    expect(result.evidenceDueBy).toBe('2024-03-15T00:00:00Z')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.gateway).toBe('braintree')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a WON dispute', () => {
    const raw: RawBraintreeDispute = {
      id: 'disp_002',
      status: 'WON',
      reason: 'DUPLICATE',
      amountDisputed: { value: '50.00', currencyIsoCode: 'EUR' },
      transaction: { id: 'txn_002' },
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('won')
    expect(result.reason).toBe('duplicate')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps a LOST dispute to status "lost"', () => {
    const raw: RawBraintreeDispute = {
      id: 'disp_003',
      status: 'LOST',
      reason: 'PRODUCT_NOT_RECEIVED',
      amountDisputed: { value: '75.00', currencyIsoCode: 'GBP' },
      transaction: { id: 'txn_003' },
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('lost')
    expect(result.reason).toBe('product_not_received')
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })

  it('maps an UNDER_REVIEW dispute', () => {
    const raw: RawBraintreeDispute = {
      id: 'disp_004',
      status: 'UNDER_REVIEW',
      amountDisputed: { value: '25.00', currencyIsoCode: 'USD' },
      transaction: { id: 'txn_004' },
    }
    const result = transformDispute(raw)
    expect(result.status).toBe('under_review')
    expect(result.reason).toBeUndefined()
    expect(() => DisputeSchema.parse(result)).not.toThrow()
  })
})

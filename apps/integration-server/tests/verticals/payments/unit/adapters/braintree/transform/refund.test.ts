import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawBraintreeRefund,
} from '../../../../../../../src/verticals/payments/adapters/braintree/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('braintree transformRefund', () => {
  it('maps a SETTLED refund to status "succeeded"', () => {
    const raw: RawBraintreeRefund = {
      id: 'ref_001',
      status: 'SETTLED',
      refundedTransaction: { id: 'txn_001' },
      amount: { value: '25.00', currencyIsoCode: 'USD' },
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('ref_001')
    expect(result.chargeId).toBe('txn_001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.gateway).toBe('braintree')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a SUBMITTED_FOR_SETTLEMENT refund to status "succeeded"', () => {
    const raw: RawBraintreeRefund = {
      id: 'ref_002',
      status: 'SUBMITTED_FOR_SETTLEMENT',
      refundedTransaction: { id: 'txn_002' },
      amount: { value: '10.00', currencyIsoCode: 'EUR' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a GATEWAY_REJECTED refund to status "failed"', () => {
    const raw: RawBraintreeRefund = {
      id: 'ref_003',
      status: 'GATEWAY_REJECTED',
      refundedTransaction: { id: 'txn_003' },
      amount: { value: '5.00', currencyIsoCode: 'GBP' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a VOIDED refund to status "cancelled"', () => {
    const raw: RawBraintreeRefund = {
      id: 'ref_004',
      status: 'VOIDED',
      refundedTransaction: { id: 'txn_004' },
      amount: { value: '15.00', currencyIsoCode: 'USD' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to legacyId when id is absent', () => {
    const raw: RawBraintreeRefund = {
      legacyId: 'legacy_ref_001',
      status: 'SETTLED',
      refundedTransaction: { id: 'txn_legacy' },
      amount: { value: '8.00', currencyIsoCode: 'USD' },
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('legacy_ref_001')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

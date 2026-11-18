import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawBraintreeTransaction,
} from '../../../../../../../src/verticals/payments/adapters/braintree/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('braintree transformCharge', () => {
  it('maps a SETTLED transaction to status "succeeded"', () => {
    const raw: RawBraintreeTransaction = {
      id: 'txn_001',
      status: 'SETTLED',
      amount: { value: '49.99', currencyIsoCode: 'USD' },
      customer: { id: 'cust_1' },
      createdAt: '2024-03-01T00:00:00Z',
      refundedTransactions: [{ id: 'ref_1' }],
      disputes: [{ id: 'disp_1' }],
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('txn_001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.customerId).toBe('cust_1')
    expect(result.refundIds).toEqual(['ref_1'])
    expect(result.disputeIds).toEqual(['disp_1'])
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.gateway).toBe('braintree')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a GATEWAY_REJECTED transaction to status "failed"', () => {
    const raw: RawBraintreeTransaction = {
      id: 'txn_002',
      status: 'GATEWAY_REJECTED',
      amount: { value: '10.00', currencyIsoCode: 'EUR' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.amount).toBe(1000)
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a VOIDED transaction to status "cancelled"', () => {
    const raw: RawBraintreeTransaction = {
      id: 'txn_003',
      status: 'VOIDED',
      amount: { value: '25.00', currencyIsoCode: 'GBP' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an AUTHORIZED transaction to status "pending"', () => {
    const raw: RawBraintreeTransaction = {
      id: 'txn_004',
      status: 'AUTHORIZED',
      amount: { value: '100.00', currencyIsoCode: 'USD' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back to legacyId when id is absent', () => {
    const raw: RawBraintreeTransaction = {
      legacyId: 'legacy_001',
      status: 'SETTLED',
      amount: { value: '5.00', currencyIsoCode: 'USD' },
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('legacy_001')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawPaystackTransaction,
} from '../../../../../../../src/verticals/payments/adapters/paystack/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('paystack transformCharge', () => {
  it('maps a success transaction to status "succeeded"', () => {
    const raw: RawPaystackTransaction = {
      id: 123456,
      reference: 'TXN_ref_001',
      status: 'success',
      amount: 50000,
      currency: 'NGN',
      gateway_response: 'Approved',
      channel: 'card',
      customer: { id: 789, email: 'buyer@example.com' },
      paid_at: '2024-03-01T00:00:00Z',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('NGN')
    expect(result.customerId).toBe('789')
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(result.gateway).toBe('paystack')
    expect(result.id).toBe('123456')
    expect(result.externalId).toBe('TXN_ref_001')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a failed transaction to status "failed"', () => {
    const raw: RawPaystackTransaction = {
      id: 111,
      reference: 'TXN_ref_002',
      status: 'failed',
      amount: 10000,
      currency: 'NGN',
      gateway_response: 'Insufficient funds',
      channel: 'card',
      customer: { email: 'user@example.com' },
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureMessage).toBe('Insufficient funds')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a pending transaction to status "pending"', () => {
    const raw: RawPaystackTransaction = {
      id: 222,
      status: 'pending',
      amount: 20000,
      currency: 'NGN',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a reversed transaction to status "refunded"', () => {
    const raw: RawPaystackTransaction = {
      id: 333,
      reference: 'TXN_ref_003',
      status: 'reversed',
      amount: 30000,
      currency: 'NGN',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('uses reference as externalId and falls back id to id field', () => {
    const raw: RawPaystackTransaction = {
      id: 999,
      reference: 'REF-ABCDE',
      status: 'success',
      amount: 5000,
      currency: 'NGN',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('999')
    expect(result.externalId).toBe('REF-ABCDE')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawFlutterwaveTransaction,
} from '../../../../../../../src/verticals/payments/adapters/flutterwave/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('flutterwave transformCharge', () => {
  it('maps a "successful" transaction to status "succeeded"', () => {
    const raw: RawFlutterwaveTransaction = {
      id: 12345,
      tx_ref: 'TX-ABC-001',
      flw_ref: 'FLW-001',
      status: 'successful',
      amount: 50.0,
      currency: 'NGN',
      payment_type: 'card',
      customer: { email: 'user@example.com', name: 'Test User', id: 99 },
      narration: 'Payment for order #001',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('12345')
    expect(result.externalId).toBe('TX-ABC-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('NGN')
    expect(result.customerId).toBe('99')
    expect(result.receiptEmail).toBe('user@example.com')
    expect(result.description).toBe('Payment for order #001')
    expect(result.gateway).toBe('flutterwave')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a "completed" transaction to status "succeeded"', () => {
    const raw: RawFlutterwaveTransaction = {
      id: 12346,
      tx_ref: 'TX-ABC-002',
      status: 'completed',
      amount: 100.0,
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(10000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a "pending" transaction to status "pending"', () => {
    const raw: RawFlutterwaveTransaction = {
      id: 12347,
      tx_ref: 'TX-ABC-003',
      status: 'pending',
      amount: 25.0,
      currency: 'GHS',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('GHS')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a "failed" transaction to status "failed"', () => {
    const raw: RawFlutterwaveTransaction = {
      id: 12348,
      tx_ref: 'TX-ABC-004',
      status: 'failed',
      amount: 10.0,
      currency: 'NGN',
      processor_response: 'Declined by issuer',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureMessage).toBe('Declined by issuer')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a "cancelled" transaction to status "cancelled"', () => {
    const raw: RawFlutterwaveTransaction = {
      id: 12349,
      tx_ref: 'TX-ABC-005',
      status: 'cancelled',
      amount: 5.0,
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('stores flw_ref and payment_type in metadata', () => {
    const raw: RawFlutterwaveTransaction = {
      id: 12350,
      tx_ref: 'TX-ABC-006',
      flw_ref: 'FLW-REF-006',
      status: 'successful',
      amount: 20.0,
      currency: 'NGN',
      payment_type: 'mobilemoney',
    }
    const result = transformCharge(raw)
    expect(result.metadata['flw_ref']).toBe('FLW-REF-006')
    expect(result.metadata['payment_type']).toBe('mobilemoney')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back to tx_ref for id when id is absent', () => {
    const raw: RawFlutterwaveTransaction = {
      tx_ref: 'TX-ABC-007',
      status: 'pending',
      amount: 8.0,
      currency: 'NGN',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('TX-ABC-007')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})

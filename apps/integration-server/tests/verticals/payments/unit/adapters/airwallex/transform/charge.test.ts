import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawAirwallexPaymentIntent,
} from '../../../../../../../src/verticals/payments/adapters/airwallex/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('airwallex transformCharge', () => {
  it('maps status "SUCCEEDED" to "succeeded" and scales major-unit amount to minor units', () => {
    const raw: RawAirwallexPaymentIntent = {
      id: 'int-001',
      amount: 49.99,
      currency: 'usd',
      status: 'SUCCEEDED',
      captured_amount: 49.99,
      refunded_amount: 0,
      customer_id: 'cus-001',
      descriptor: 'ACME Store',
      created_at: '2024-03-01T12:00:00+0000',
      updated_at: '2024-03-01T12:00:00+0000',
      latest_payment_attempt: {
        id: 'att-001',
        payment_method: { id: 'pm-001', type: 'card' },
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('airwallex')
    expect(result.captured).toBe(true)
    expect(result.customerId).toBe('cus-001')
    expect(result.paymentMethodId).toBe('pm-001')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "FAILED" to "failed"', () => {
    const raw: RawAirwallexPaymentIntent = {
      id: 'int-002',
      amount: 20.0,
      currency: 'EUR',
      status: 'FAILED',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.captured).toBeUndefined()
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "CANCELLED" to "cancelled"', () => {
    const raw: RawAirwallexPaymentIntent = {
      id: 'int-003',
      amount: 10.0,
      currency: 'GBP',
      status: 'CANCELLED',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "EXPIRED" to "cancelled"', () => {
    const raw: RawAirwallexPaymentIntent = {
      id: 'int-004',
      amount: 5.0,
      currency: 'USD',
      status: 'EXPIRED',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "PENDING" to "pending"', () => {
    const raw: RawAirwallexPaymentIntent = {
      id: 'int-005',
      amount: 15.0,
      currency: 'AUD',
      status: 'PENDING',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps SUCCEEDED with full refund to "refunded"', () => {
    const raw: RawAirwallexPaymentIntent = {
      id: 'int-006',
      amount: 30.0,
      currency: 'USD',
      status: 'SUCCEEDED',
      captured_amount: 30.0,
      refunded_amount: 30.0,
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps SUCCEEDED with partial refund to "partially_refunded"', () => {
    const raw: RawAirwallexPaymentIntent = {
      id: 'int-007',
      amount: 100.0,
      currency: 'USD',
      status: 'SUCCEEDED',
      captured_amount: 100.0,
      refunded_amount: 25.0,
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('partially_refunded')
    expect(result.amountRefunded).toBe(2500)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back to USD when currency is absent', () => {
    const raw: RawAirwallexPaymentIntent = {
      id: 'int-008',
      amount: 10.0,
      status: 'SUCCEEDED',
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('USD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('uses attempt.id as paymentMethodId when payment_method.id is absent', () => {
    const raw: RawAirwallexPaymentIntent = {
      id: 'int-009',
      amount: 10.0,
      currency: 'USD',
      status: 'SUCCEEDED',
      latest_payment_attempt: {
        id: 'att-009',
      },
    }
    const result = transformCharge(raw)
    expect(result.paymentMethodId).toBe('att-009')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})

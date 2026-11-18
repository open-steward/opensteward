import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawCheckoutPayment,
} from '../../../../../../../src/verticals/payments/adapters/checkout-com/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('checkout-com transformCharge', () => {
  it('maps a captured payment to status "succeeded"', () => {
    const raw: RawCheckoutPayment = {
      id: 'pay_001',
      amount: 4999,
      currency: 'usd',
      approved: true,
      status: 'captured',
      customer: { id: 'cus_001', email: 'buyer@example.com' },
      source: { id: 'src_001', type: 'card' },
      reference: 'ORDER-42',
      description: 'Order payment',
      requested_on: '2024-03-01T12:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('pay_001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.customerId).toBe('cus_001')
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(result.paymentMethodId).toBe('src_001')
    expect(result.description).toBe('Order payment')
    expect(result.gateway).toBe('checkout-com')
    expect(result.metadata.reference).toBe('ORDER-42')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an authorized payment to status "pending"', () => {
    const raw: RawCheckoutPayment = {
      id: 'pay_002',
      amount: 2000,
      currency: 'eur',
      status: 'authorized',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a declined payment to status "failed"', () => {
    const raw: RawCheckoutPayment = {
      id: 'pay_003',
      amount: 1000,
      currency: 'gbp',
      status: 'declined',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a voided payment to status "cancelled"', () => {
    const raw: RawCheckoutPayment = {
      id: 'pay_004',
      amount: 3000,
      currency: 'usd',
      status: 'voided',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a refunded payment to status "refunded"', () => {
    const raw: RawCheckoutPayment = {
      id: 'pay_005',
      amount: 1500,
      currency: 'usd',
      status: 'refunded',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('falls back to "succeeded" for unknown status when approved=true', () => {
    const raw: RawCheckoutPayment = {
      id: 'pay_006',
      amount: 800,
      currency: 'usd',
      approved: true,
      status: 'some_new_status',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})

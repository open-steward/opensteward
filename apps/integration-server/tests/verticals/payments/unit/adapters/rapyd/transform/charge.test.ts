import { describe, it, expect } from 'vitest'
import { transformCharge } from '../../../../../../../src/verticals/payments/adapters/rapyd/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('rapyd transformCharge', () => {
  it('converts a successful CLO payment with decimal amount to minor units', () => {
    const raw = {
      id: 'payment_abc123',
      amount: 125.0,
      currency_code: 'usd',
      status: 'CLO',
      paid: true,
      captured: true,
      customer_token: 'cus_xyz',
      payment_method: 'pm_card_1',
      description: 'Order #42',
      created_at: 1_700_000_000,
      updated_at: 1_700_001_000,
      metadata: { orderId: '42' },
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('payment_abc123')
    expect(result.externalId).toBe('payment_abc123')
    expect(result.amount).toBe(12500)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.captured).toBe(true)
    expect(result.customerId).toBe('cus_xyz')
    expect(result.paymentMethodId).toBe('pm_card_1')
    expect(result.description).toBe('Order #42')
    expect(result.gateway).toBe('rapyd')
    expect(result.metadata.orderId).toBe('42')
    expect(result.createdAt).toMatch(/^2023-/)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a fully refunded payment to status "refunded"', () => {
    const raw = {
      id: 'payment_refunded',
      amount: 50.0,
      refunded_amount: 50.0,
      currency_code: 'EUR',
      status: 'CLO',
      paid: true,
      refunded: true,
      created_at: 1_700_000_000,
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(result.amountRefunded).toBe(5000)
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an ACT payment to status "pending"', () => {
    const raw = {
      id: 'payment_pending',
      amount: 20.0,
      currency_code: 'GBP',
      status: 'ACT',
      paid: false,
      created_at: 1_700_000_000,
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('GBP')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an EXP payment to status "cancelled"', () => {
    const raw = {
      id: 'payment_expired',
      amount: 10.0,
      currency_code: 'USD',
      status: 'EXP',
      created_at: 1_700_000_000,
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a partially-refunded payment correctly', () => {
    const raw = {
      id: 'payment_partial',
      amount: 100.0,
      refunded_amount: 30.0,
      currency_code: 'USD',
      status: 'CLO',
      paid: true,
      created_at: 1_700_000_000,
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('partially_refunded')
    expect(result.amountRefunded).toBe(3000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})

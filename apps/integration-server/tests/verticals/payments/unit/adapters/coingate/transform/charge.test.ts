import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawCoingateOrder,
} from '../../../../../../../src/verticals/payments/adapters/coingate/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('coingate transformCharge', () => {
  it('maps a "paid" order to status "succeeded"', () => {
    const raw: RawCoingateOrder = {
      id: 12345,
      order_id: 'ord-001',
      status: 'paid',
      price_currency: 'EUR',
      price_amount: '10.00',
      created_at: '2024-03-01T00:00:00+00:00',
      paid_at: '2024-03-01T00:00:00+00:00',
      description: 'Test order',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('12345')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(1000)
    expect(result.currency).toBe('EUR')
    expect(result.gateway).toBe('coingate')
    expect(result.captured).toBe(true)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an "invalid" order to status "failed"', () => {
    const raw: RawCoingateOrder = {
      id: 12346,
      status: 'invalid',
      price_currency: 'USD',
      price_amount: '5.00',
      created_at: '2024-03-01T00:00:00+00:00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.currency).toBe('USD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a "refunded" order to status "refunded"', () => {
    const raw: RawCoingateOrder = {
      id: 12347,
      status: 'refunded',
      price_currency: 'EUR',
      price_amount: '20.00',
      created_at: '2024-03-01T00:00:00+00:00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a "canceled" order to status "cancelled"', () => {
    const raw: RawCoingateOrder = {
      id: 12348,
      status: 'canceled',
      price_currency: 'USD',
      price_amount: '15.00',
      created_at: '2024-03-01T00:00:00+00:00',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps shopper email to receiptEmail and includes payment_url as receiptUrl', () => {
    const raw: RawCoingateOrder = {
      id: 12349,
      status: 'new',
      price_currency: 'EUR',
      price_amount: '50.00',
      payment_url: 'https://pay.coingate.com/invoice/12349',
      shopper: { email: 'buyer@example.com' },
      created_at: '2024-03-01T00:00:00+00:00',
    }
    const result = transformCharge(raw)
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(result.receiptUrl).toBe('https://pay.coingate.com/invoice/12349')
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})

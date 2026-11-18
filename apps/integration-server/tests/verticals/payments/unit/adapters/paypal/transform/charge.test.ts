import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawPayPalCapture,
} from '../../../../../../../src/verticals/payments/adapters/paypal/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('paypal transformCharge', () => {
  it('maps a COMPLETED capture to status "succeeded"', () => {
    const raw: RawPayPalCapture = {
      id: 'CAP-001',
      status: 'COMPLETED',
      amount: { value: '49.99', currency_code: 'USD' },
      payer: { payer_id: 'PAYER123', email_address: 'buyer@example.com' },
      description: 'Order #42',
      create_time: '2024-03-01T12:00:00Z',
      custom_id: 'ord-42',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.customerId).toBe('PAYER123')
    expect(result.gateway).toBe('paypal')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING capture to status "pending"', () => {
    const raw: RawPayPalCapture = {
      id: 'CAP-002',
      status: 'PENDING',
      amount: { value: '10.00', currency_code: 'EUR' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a REFUNDED capture to status "refunded"', () => {
    const raw: RawPayPalCapture = {
      id: 'CAP-003',
      status: 'REFUNDED',
      amount: { value: '20.00', currency_code: 'GBP' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a PARTIALLY_REFUNDED capture correctly', () => {
    const raw: RawPayPalCapture = {
      id: 'CAP-004',
      status: 'PARTIALLY_REFUNDED',
      amount: { value: '30.00', currency_code: 'USD' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('partially_refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})

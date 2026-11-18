import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawBitpayInvoice,
} from '../../../../../../../src/verticals/payments/adapters/bitpay/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('bitpay transformCharge', () => {
  it('maps a "complete" invoice to status "succeeded" with correct amount', () => {
    const raw: RawBitpayInvoice = {
      id: 'INVOICE-001',
      status: 'complete',
      price: 49.99,
      currency: 'USD',
      itemDesc: 'Order #42',
      url: 'https://bitpay.com/invoice/INVOICE-001',
      invoiceTime: 1709251200000,
      buyerProvidedInfo: { emailAddress: 'buyer@example.com' },
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('INVOICE-001')
    expect(result.status).toBe('succeeded')
    // 49.99 USD → 4999 cents
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.captured).toBe(true)
    expect(result.gateway).toBe('bitpay')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a "paid" invoice to status "pending"', () => {
    const raw: RawBitpayInvoice = {
      id: 'INVOICE-002',
      status: 'paid',
      price: 10.0,
      currency: 'EUR',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.captured).toBe(false)
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a "confirmed" invoice to status "succeeded"', () => {
    const raw: RawBitpayInvoice = {
      id: 'INVOICE-003',
      status: 'confirmed',
      price: 100.0,
      currency: 'GBP',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(10000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an "expired" invoice to status "cancelled"', () => {
    const raw: RawBitpayInvoice = {
      id: 'INVOICE-004',
      status: 'expired',
      price: 25.0,
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an "invalid" invoice to status "failed"', () => {
    const raw: RawBitpayInvoice = {
      id: 'INVOICE-005',
      status: 'invalid',
      price: 30.0,
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps paidPartial exceptionStatus to "refunded"', () => {
    const raw: RawBitpayInvoice = {
      id: 'INVOICE-006',
      status: 'paid',
      exceptionStatus: 'paidPartial',
      price: 50.0,
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('carries receiptEmail from buyer fallback', () => {
    const raw: RawBitpayInvoice = {
      id: 'INVOICE-007',
      status: 'complete',
      price: 15.0,
      currency: 'USD',
      buyer: { email: 'buyer@fallback.example' },
    }
    const result = transformCharge(raw)
    expect(result.receiptEmail).toBe('buyer@fallback.example')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})

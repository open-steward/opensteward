import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawNowpaymentsInvoice,
} from '../../../../../../../src/verticals/payments/adapters/nowpayments/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('nowpayments transformInvoice', () => {
  it('maps a full invoice response to canonical Invoice', () => {
    const raw: RawNowpaymentsInvoice = {
      id: 9001,
      order_id: 'ORD-001',
      order_description: 'Annual plan',
      price_amount: 99.99,
      price_currency: 'USD',
      pay_currency: 'BTC',
      invoice_url: 'https://nowpayments.io/pay/abc123',
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformInvoice(raw)
    expect(result.id).toBe('9001')
    expect(result.externalId).toBe('9001')
    expect(result.status).toBe('open')
    expect(result.total).toBe(9999)
    expect(result.currency).toBe('USD')
    expect(result.number).toBe('ORD-001')
    expect(result.hostedInvoiceUrl).toBe('https://nowpayments.io/pay/abc123')
    expect(result.gateway).toBe('nowpayments')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('status is always "open"', () => {
    const raw: RawNowpaymentsInvoice = {
      id: '9002',
      price_amount: 50,
      price_currency: 'EUR',
    }
    const result = transformInvoice(raw)
    expect(result.status).toBe('open')
    expect(result.currency).toBe('EUR')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to USD when price_currency is null', () => {
    const raw: RawNowpaymentsInvoice = {
      id: '9003',
      price_amount: 25,
      price_currency: null,
    }
    const result = transformInvoice(raw)
    expect(result.currency).toBe('USD')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })

  it('includes metadata fields from order details', () => {
    const raw: RawNowpaymentsInvoice = {
      id: '9004',
      order_id: 'ORDER-XYZ',
      order_description: 'Test order',
      pay_currency: 'ETH',
      price_amount: 10,
      price_currency: 'USD',
    }
    const result = transformInvoice(raw)
    expect(result.metadata['order_id']).toBe('ORDER-XYZ')
    expect(result.metadata['order_description']).toBe('Test order')
    expect(result.metadata['pay_currency']).toBe('ETH')
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

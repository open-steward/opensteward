import { describe, it, expect } from 'vitest'
import {
  transformInvoiceLineItem,
  type RawStripeInvoiceLineItem,
} from '../../../../../../../src/verticals/payments/adapters/yapily/transform/invoice-line-item'
import { InvoiceLineItemSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('yapily transformInvoiceLineItem (stripe-scaffold)', () => {
  it('maps a line item with price and period fields', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'il-001',
      object: 'line_item',
      description: 'Monthly subscription',
      quantity: 1,
      unit_amount: 5000,
      amount: 5000,
      currency: 'usd',
      price: { id: 'price-001', product: 'prod-001' },
      invoice: 'inv-001',
      period: { start: 1709251200, end: 1711929600 },
      proration: false,
    }
    const result = transformInvoiceLineItem(raw)
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.priceId).toBe('price-001')
    expect(result.productId).toBe('prod-001')
    expect(result.invoiceId).toBe('inv-001')
    expect(result.proration).toBe(false)
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })

  it('uses passed invoiceId over raw.invoice', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'il-002',
      object: 'line_item',
      amount: 2500,
      currency: 'eur',
      invoice: 'inv-original',
    }
    const result = transformInvoiceLineItem(raw, 'inv-override')
    expect(result.invoiceId).toBe('inv-override')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })
})

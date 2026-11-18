import { describe, it, expect } from 'vitest'
import {
  transformInvoiceLineItem,
  type RawStripeInvoiceLineItem,
} from '../../../../../../../src/verticals/payments/adapters/zip-bnpl/transform/invoice-line-item'
import { InvoiceLineItemSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('zip-bnpl transformInvoiceLineItem', () => {
  it('maps id, amount and currency correctly', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'zip-li-001',
      object: 'line_item',
      amount: 4900,
      currency: 'usd',
      description: 'Subscription item',
      quantity: 1,
      unit_amount: 4900,
      invoice: 'inv-001',
    }
    const result = transformInvoiceLineItem(raw)
    expect(result.id).toBe('zip-li-001')
    expect(result.amount).toBe(4900)
    expect(result.currency).toBe('USD')
    expect(result.description).toBe('Subscription item')
    expect(result.invoiceId).toBe('inv-001')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })

  it('uses provided invoiceId over embedded invoice field', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'zip-li-002',
      object: 'line_item',
      amount: 1000,
      currency: 'eur',
      invoice: 'inv-embedded',
    }
    const result = transformInvoiceLineItem(raw, 'inv-override')
    expect(result.invoiceId).toBe('inv-override')
    expect(result.currency).toBe('EUR')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })

  it('maps priceId and productId from price object', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'zip-li-003',
      object: 'line_item',
      amount: 2500,
      currency: 'gbp',
      price: { id: 'price-001', product: 'prod-001' },
      invoice: 'inv-003',
    }
    const result = transformInvoiceLineItem(raw)
    expect(result.priceId).toBe('price-001')
    expect(result.productId).toBe('prod-001')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })
})

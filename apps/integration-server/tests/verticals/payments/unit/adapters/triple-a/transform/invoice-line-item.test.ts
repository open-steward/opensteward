import { describe, it, expect } from 'vitest'
import {
  transformInvoiceLineItem,
  type RawStripeInvoiceLineItem,
} from '../../../../../../../src/verticals/payments/adapters/triple-a/transform/invoice-line-item'
import { InvoiceLineItemSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('triple-a transformInvoiceLineItem', () => {
  it('maps a line item with price and product', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'li-ta-001',
      object: 'line_item',
      description: 'Crypto service fee',
      quantity: 1,
      unit_amount: 3000,
      amount: 3000,
      currency: 'usd',
      price: { id: 'price-ta-001', product: 'prod-ta-001' },
    }
    const result = transformInvoiceLineItem(raw, 'inv-ta-001')
    expect(result.id).toBe('li-ta-001')
    expect(result.invoiceId).toBe('inv-ta-001')
    expect(result.amount).toBe(3000)
    expect(result.currency).toBe('USD')
    expect(result.priceId).toBe('price-ta-001')
    expect(result.productId).toBe('prod-ta-001')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })

  it('falls back to raw.invoice when no invoiceId passed', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'li-ta-002',
      object: 'line_item',
      amount: 1500,
      currency: 'EUR',
      invoice: 'inv-ta-fallback',
    }
    const result = transformInvoiceLineItem(raw)
    expect(result.invoiceId).toBe('inv-ta-fallback')
    expect(result.currency).toBe('EUR')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })
})

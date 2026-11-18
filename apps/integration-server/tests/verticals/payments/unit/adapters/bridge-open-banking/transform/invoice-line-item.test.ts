import { describe, it, expect } from 'vitest'
import {
  transformInvoiceLineItem,
  type RawStripeInvoiceLineItem,
} from '../../../../../../../src/verticals/payments/adapters/bridge-open-banking/transform/invoice-line-item'
import { InvoiceLineItemSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('bridge-open-banking transformInvoiceLineItem', () => {
  it('maps a full invoice line item', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'li-001',
      object: 'line_item',
      description: 'Monthly Pro Plan',
      quantity: 2,
      unit_amount: 2500,
      amount: 5000,
      currency: 'usd',
      price: { id: 'price-001', product: 'prod-001' },
      invoice: 'inv-001',
      proration: false,
    }
    const result = transformInvoiceLineItem(raw)
    expect(result.id).toBe('li-001')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.quantity).toBe(2)
    expect(result.priceId).toBe('price-001')
    expect(result.productId).toBe('prod-001')
    expect(result.invoiceId).toBe('inv-001')
    expect(result.description).toBe('Monthly Pro Plan')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })

  it('uses supplied invoiceId parameter over raw.invoice', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'li-002',
      object: 'line_item',
      amount: 1000,
      currency: 'eur',
      invoice: 'inv-from-raw',
    }
    const result = transformInvoiceLineItem(raw, 'inv-from-param')
    expect(result.invoiceId).toBe('inv-from-param')
  })
})

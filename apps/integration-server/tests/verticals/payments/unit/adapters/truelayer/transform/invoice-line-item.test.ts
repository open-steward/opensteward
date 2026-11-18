import { describe, it, expect } from 'vitest'
import {
  transformInvoiceLineItem,
  type RawStripeInvoiceLineItem,
} from '../../../../../../../src/verticals/payments/adapters/truelayer/transform/invoice-line-item'
import { InvoiceLineItemSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('truelayer transformInvoiceLineItem', () => {
  it('maps a line item with price and product refs', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'li_tl_001',
      object: 'line_item',
      description: 'Pro subscription',
      quantity: 1,
      unit_amount: 9900,
      amount: 9900,
      currency: 'usd',
      price: { id: 'price_tl_001', product: 'prod_tl_001' },
      invoice: 'inv_tl_001',
    }
    const result = transformInvoiceLineItem(raw)
    expect(result.id).toBe('li_tl_001')
    expect(result.amount).toBe(9900)
    expect(result.currency).toBe('USD')
    expect(result.priceId).toBe('price_tl_001')
    expect(result.productId).toBe('prod_tl_001')
    expect(result.invoiceId).toBe('inv_tl_001')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })

  it('uses provided invoiceId over raw.invoice', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'li_tl_002',
      object: 'line_item',
      amount: 4900,
      currency: 'eur',
      invoice: 'inv_tl_001',
    }
    const result = transformInvoiceLineItem(raw, 'inv_tl_override')
    expect(result.invoiceId).toBe('inv_tl_override')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })
})

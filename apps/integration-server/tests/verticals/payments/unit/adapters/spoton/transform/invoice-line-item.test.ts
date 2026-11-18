import { describe, it, expect } from 'vitest'
import {
  transformInvoiceLineItem,
  type RawStripeInvoiceLineItem,
} from '../../../../../../../src/verticals/payments/adapters/spoton/transform/invoice-line-item'
import { InvoiceLineItemSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('spoton transformInvoiceLineItem', () => {
  it('maps a basic line item with all fields', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'il_spoton_1',
      object: 'line_item',
      description: 'Subscription to Pro plan',
      quantity: 1,
      unit_amount: 5000,
      amount: 5000,
      currency: 'usd',
      price: { id: 'price_1', product: 'prod_1' },
      subscription: 'sub_1',
      invoice: 'inv_1',
      proration: false,
    }
    const result = transformInvoiceLineItem(raw)
    expect(result.id).toBe('il_spoton_1')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.priceId).toBe('price_1')
    expect(result.productId).toBe('prod_1')
    expect(result.invoiceId).toBe('inv_1')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })

  it('uses invoiceId argument when provided', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'il_spoton_2',
      object: 'line_item',
      amount: 2000,
      currency: 'eur',
    }
    const result = transformInvoiceLineItem(raw, 'inv_override')
    expect(result.invoiceId).toBe('inv_override')
    expect(result.currency).toBe('EUR')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })

  it('handles proration flag', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'il_spoton_3',
      object: 'line_item',
      amount: 1000,
      currency: 'gbp',
      invoice: 'inv_2',
      proration: true,
    }
    const result = transformInvoiceLineItem(raw)
    expect(result.proration).toBe(true)
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })
})

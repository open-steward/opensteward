import { describe, it, expect } from 'vitest'
import {
  transformInvoiceLineItem,
  type RawStripeInvoiceLineItem,
} from '../../../../../../../src/verticals/payments/adapters/payoneer/transform/invoice-line-item'
import { InvoiceLineItemSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('payoneer transformInvoiceLineItem', () => {
  it('maps a line item with explicit invoiceId argument', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'il_001',
      object: 'line_item',
      description: 'Pro Plan — March 2024',
      quantity: 1,
      unit_amount: 12500,
      amount: 12500,
      currency: 'usd',
      price: { id: 'price_001', product: 'prod_001' },
      proration: false,
    }

    const result = transformInvoiceLineItem(raw, 'inv_001')

    expect(result.id).toBe('il_001')
    expect(result.invoiceId).toBe('inv_001')
    expect(result.amount).toBe(12500)
    expect(result.currency).toBe('USD')
    expect(result.priceId).toBe('price_001')
    expect(result.productId).toBe('prod_001')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })

  it('falls back to raw.invoice when no invoiceId argument', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'il_002',
      object: 'line_item',
      amount: 5000,
      currency: 'EUR',
      invoice: 'inv_002',
    }

    const result = transformInvoiceLineItem(raw)

    expect(result.invoiceId).toBe('inv_002')
    expect(result.currency).toBe('EUR')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformInvoiceLineItem,
  type RawStripeInvoiceLineItem,
} from '../../../../../../../src/verticals/payments/adapters/tyro/transform/invoice-line-item'
import { InvoiceLineItemSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('tyro transformInvoiceLineItem', () => {
  it('maps a line item with price and product', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'li_tyro_001',
      object: 'line_item',
      description: 'POS terminal subscription',
      quantity: 2,
      unit_amount: 4900,
      amount: 9800,
      currency: 'aud',
      price: { id: 'price_tyro_001', product: 'prod_tyro_001' },
      invoice: 'inv_tyro_001',
    }
    const result = transformInvoiceLineItem(raw)
    expect(result.id).toBe('li_tyro_001')
    expect(result.amount).toBe(9800)
    expect(result.currency).toBe('AUD')
    expect(result.priceId).toBe('price_tyro_001')
    expect(result.quantity).toBe(2)
    expect(result.invoiceId).toBe('inv_tyro_001')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })

  it('uses provided invoiceId override', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'li_tyro_002',
      object: 'line_item',
      amount: 4900,
      currency: 'aud',
      invoice: 'inv_tyro_001',
    }
    const result = transformInvoiceLineItem(raw, 'inv_tyro_override')
    expect(result.invoiceId).toBe('inv_tyro_override')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })
})

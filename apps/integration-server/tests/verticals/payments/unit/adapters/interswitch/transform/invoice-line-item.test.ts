import { describe, it, expect } from 'vitest'
import {
  transformInvoiceLineItem,
  type RawStripeInvoiceLineItem,
} from '../../../../../../../src/verticals/payments/adapters/interswitch/transform/invoice-line-item'
import { InvoiceLineItemSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('interswitch transformInvoiceLineItem', () => {
  it('maps a line item with explicit invoiceId argument', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'il-001',
      object: 'line_item',
      description: 'Subscription charge',
      quantity: 1,
      unit_amount: 5000,
      amount: 5000,
      currency: 'usd',
      price: { id: 'price-001', product: 'prod-001' },
      period: { start: 1709251200, end: 1711929600 },
    }
    const result = transformInvoiceLineItem(raw, 'inv-001')
    expect(result.id).toBe('il-001')
    expect(result.invoiceId).toBe('inv-001')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.priceId).toBe('price-001')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })

  it('falls back to raw.invoice when no invoiceId argument is given', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'il-002',
      object: 'line_item',
      amount: 2500,
      currency: 'eur',
      invoice: 'inv-002',
    }
    const result = transformInvoiceLineItem(raw)
    expect(result.invoiceId).toBe('inv-002')
    expect(result.currency).toBe('EUR')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })
})

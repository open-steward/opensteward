import { describe, it, expect } from 'vitest'
import {
  transformInvoiceLineItem,
  type RawStripeInvoiceLineItem,
} from '../../../../../../../src/verticals/payments/adapters/zuora/transform/invoice-line-item'
import { InvoiceLineItemSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('zuora transformInvoiceLineItem', () => {
  it('maps id, amount and currency correctly', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'zuora-li-001',
      object: 'line_item',
      amount: 9900,
      currency: 'usd',
      description: 'Zuora subscription item',
      quantity: 1,
      unit_amount: 9900,
      invoice: 'zuora-inv-001',
    }
    const result = transformInvoiceLineItem(raw)
    expect(result.id).toBe('zuora-li-001')
    expect(result.amount).toBe(9900)
    expect(result.currency).toBe('USD')
    expect(result.description).toBe('Zuora subscription item')
    expect(result.invoiceId).toBe('zuora-inv-001')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })

  it('uses provided invoiceId over embedded invoice field', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'zuora-li-002',
      object: 'line_item',
      amount: 4900,
      currency: 'eur',
      invoice: 'zuora-inv-embedded',
    }
    const result = transformInvoiceLineItem(raw, 'zuora-inv-override')
    expect(result.invoiceId).toBe('zuora-inv-override')
    expect(result.currency).toBe('EUR')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })

  it('maps priceId and productId from price object', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'zuora-li-003',
      object: 'line_item',
      amount: 1500,
      currency: 'gbp',
      price: { id: 'zuora-price-001', product: 'zuora-prod-001' },
      invoice: 'zuora-inv-003',
    }
    const result = transformInvoiceLineItem(raw)
    expect(result.priceId).toBe('zuora-price-001')
    expect(result.productId).toBe('zuora-prod-001')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })
})

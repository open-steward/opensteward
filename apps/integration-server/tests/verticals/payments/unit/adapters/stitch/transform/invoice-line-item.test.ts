import { describe, it, expect } from 'vitest'
import {
  transformInvoiceLineItem,
  type RawStripeInvoiceLineItem,
} from '../../../../../../../src/verticals/payments/adapters/stitch/transform/invoice-line-item'
import { InvoiceLineItemSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('stitch transformInvoiceLineItem', () => {
  it('maps id, amount, currency, and invoiceId from raw.invoice', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'il_stitch_001',
      object: 'line_item',
      amount: 4999,
      currency: 'usd',
      invoice: 'inv_001',
    }
    const result = transformInvoiceLineItem(raw)
    expect(result.id).toBe('il_stitch_001')
    expect(result.externalId).toBe('il_stitch_001')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.invoiceId).toBe('inv_001')
  })

  it('prefers the explicit invoiceId arg over raw.invoice', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'il_stitch_002',
      object: 'line_item',
      amount: 2500,
      currency: 'usd',
      invoice: 'inv_raw',
    }
    const result = transformInvoiceLineItem(raw, 'inv_explicit')
    expect(result.invoiceId).toBe('inv_explicit')
  })

  it('upper-cases currency', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'il_stitch_003',
      object: 'line_item',
      amount: 1000,
      currency: 'eur',
      invoice: 'inv_003',
    }
    const result = transformInvoiceLineItem(raw)
    expect(result.currency).toBe('EUR')
  })

  it('maps description, quantity, unitAmount, and proration', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'il_stitch_004',
      object: 'line_item',
      description: 'Seat x5',
      quantity: 5,
      unit_amount: 999,
      amount: 4995,
      currency: 'usd',
      invoice: 'inv_004',
      proration: false,
    }
    const result = transformInvoiceLineItem(raw)
    expect(result.description).toBe('Seat x5')
    expect(result.quantity).toBe(5)
    expect(result.unitAmount).toBe(999)
    expect(result.proration).toBe(false)
  })

  it('maps priceId and productId from price object', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'il_stitch_005',
      object: 'line_item',
      amount: 2999,
      currency: 'usd',
      invoice: 'inv_005',
      price: { id: 'price_001', product: 'prod_001' },
    }
    const result = transformInvoiceLineItem(raw)
    expect(result.priceId).toBe('price_001')
    expect(result.productId).toBe('prod_001')
  })

  it('maps periodStart and periodEnd from unix timestamps', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'il_stitch_006',
      object: 'line_item',
      amount: 5000,
      currency: 'usd',
      invoice: 'inv_006',
      period: { start: 1709251200, end: 1711929600 },
    }
    const result = transformInvoiceLineItem(raw)
    expect(result.periodStart).toBe('2024-03-01T00:00:00.000Z')
    expect(result.periodEnd).toMatch(/^2024-04-/)
  })

  it('maps subscriptionId from subscription field', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'il_stitch_007',
      object: 'line_item',
      amount: 3000,
      currency: 'usd',
      invoice: 'inv_007',
      subscription: 'sub_001',
    }
    const result = transformInvoiceLineItem(raw)
    expect(result.subscriptionId).toBe('sub_001')
  })

  it('passes InvoiceLineItemSchema validation', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'il_stitch_008',
      object: 'line_item',
      description: 'Pro plan',
      quantity: 1,
      unit_amount: 9999,
      amount: 9999,
      currency: 'gbp',
      invoice: 'inv_008',
      price: { id: 'price_001', product: 'prod_001' },
      subscription: 'sub_001',
      period: { start: 1709251200, end: 1711929600 },
      proration: false,
      metadata: { note: 'annual' },
    }
    const result = transformInvoiceLineItem(raw, 'inv_008')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })
})

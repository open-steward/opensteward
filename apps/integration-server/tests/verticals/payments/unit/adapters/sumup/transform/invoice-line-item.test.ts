import { describe, it, expect } from 'vitest'
import {
  transformInvoiceLineItem,
  type RawStripeInvoiceLineItem,
} from '../../../../../../../src/verticals/payments/adapters/sumup/transform/invoice-line-item'
import { InvoiceLineItemSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

describe('sumup transformInvoiceLineItem', () => {
  it('maps id, amount, currency and uses invoiceId param', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'il_001',
      object: 'line_item',
      amount: 4999,
      currency: 'usd',
    }
    const result = transformInvoiceLineItem(raw, 'inv_abc')
    expect(result.id).toBe('il_001')
    expect(result.externalId).toBe('il_001')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.invoiceId).toBe('inv_abc')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })

  it('falls back to raw.invoice when invoiceId param is omitted', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'il_002',
      object: 'line_item',
      amount: 1000,
      currency: 'usd',
      invoice: 'inv_from_raw',
    }
    expect(transformInvoiceLineItem(raw).invoiceId).toBe('inv_from_raw')
  })

  it('uses empty string invoiceId when neither param nor raw.invoice present', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'il_003',
      object: 'line_item',
      amount: 500,
      currency: 'usd',
    }
    expect(transformInvoiceLineItem(raw).invoiceId).toBe('')
  })

  it('maps quantity, unitAmount, description and proration', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'il_004',
      object: 'line_item',
      amount: 9900,
      currency: 'usd',
      quantity: 2,
      unit_amount: 4950,
      description: 'Pro plan × 2',
      proration: false,
    }
    const result = transformInvoiceLineItem(raw, 'inv_x')
    expect(result.quantity).toBe(2)
    expect(result.unitAmount).toBe(4950)
    expect(result.description).toBe('Pro plan × 2')
    expect(result.proration).toBe(false)
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })

  it('maps priceId and productId from price object', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'il_005',
      object: 'line_item',
      amount: 2000,
      currency: 'usd',
      price: { id: 'price_abc', product: 'prod_abc' },
    }
    const result = transformInvoiceLineItem(raw, 'inv_y')
    expect(result.priceId).toBe('price_abc')
    expect(result.productId).toBe('prod_abc')
  })

  it('maps subscriptionId and period timestamps', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'il_006',
      object: 'line_item',
      amount: 3000,
      currency: 'usd',
      subscription: 'sub_abc',
      period: { start: 1709251200, end: 1711929600 },
    }
    const result = transformInvoiceLineItem(raw, 'inv_z')
    expect(result.subscriptionId).toBe('sub_abc')
    expect(result.periodStart).toBe('2024-03-01T00:00:00.000Z')
    expect(() => InvoiceLineItemSchema.parse(result)).not.toThrow()
  })

  it('upcases currency', () => {
    const raw: RawStripeInvoiceLineItem = {
      id: 'il_007',
      object: 'line_item',
      amount: 100,
      currency: 'gbp',
    }
    expect(transformInvoiceLineItem(raw, 'inv_cur').currency).toBe('GBP')
  })
})

/**
 * Fixture: the first row of the List Invoices response example,
 * https://docs.rapyd.net/en/list-invoices.html (plan sub-object trimmed).
 */
import { describe, it, expect } from 'vitest'
import { transformInvoice } from '../../../../../../../src/verticals/payments/adapters/rapyd/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

const DOC_INVOICE = {
  id: 'invoice_6dad95c1d91a47b8c59728eaccdd8c1c',
  attempt_count: 0,
  billing: 'pay_automatically',
  billing_reason: 'subscription_cycle',
  created_at: 1761613560000,
  currency: 'USD',
  customer: 'cus_5bee14584a78638ba717e746be62ee01',
  description: '',
  discount: null,
  due_date: 1764205560000,
  days_until_due: 0,
  metadata: {},
  payment: null,
  payout: null,
  payment_fields: null,
  period_end: 1762269042000,
  period_start: 1761664242000,
  lines: [
    {
      id: 'il_cd7fc7874db4d422456ade7a2e242196',
      amount: 500,
      currency: 'USD',
      description: 'SEO',
      quantity: 1,
      subscription: 'sub_b45547bd37ba2dc9094dcd7b62983550',
      type: 'subscription',
    },
  ],
  statement_descriptor: '',
  subscription: 'sub_b45547bd37ba2dc9094dcd7b62983550',
  discount_amount: 0,
  subtotal: 500,
  tax: 0,
  tax_percent: 0,
  total: 500,
  status: 'draft',
  payout_fields: null,
  type: 'payment',
}

describe('rapyd transformInvoice', () => {
  it('maps the documented List Invoices row and parses as a canonical Invoice', () => {
    const r = InvoiceSchema.parse(transformInvoice(DOC_INVOICE))
    expect(r.id).toBe('invoice_6dad95c1d91a47b8c59728eaccdd8c1c')
    expect(r.externalId).toBe(r.id)
    expect(r.customerId).toBe('cus_5bee14584a78638ba717e746be62ee01')
    expect(r.subscriptionId).toBe('sub_b45547bd37ba2dc9094dcd7b62983550')
    expect(r.status).toBe('draft')
    expect(r.currency).toBe('USD')
    // "Total after discount and tax. Decimal." — major units.
    expect(r.total).toBe(50000)
    expect(r.subtotal).toBe(50000)
    expect(r.tax).toBe(0)
    expect(r.createdAt).toBe(new Date(1761613560000).toISOString())
    expect(r.periodStart).toBe(new Date(1761664242000).toISOString())
    expect(r.dueDate).toBe(new Date(1764205560000).toISOString())
    expect(r.lineItemIds).toEqual(['il_cd7fc7874db4d422456ade7a2e242196'])
    expect(r.gateway).toBe('rapyd')
  })

  it('scales by the currency exponent, not a hard-coded 100', () => {
    const r = InvoiceSchema.parse(
      transformInvoice({ ...DOC_INVOICE, currency: 'JPY', total: 1200 }),
    )
    expect(r.total).toBe(1200)
  })

  it('scales the optional subtotal and tax by the currency exponent too', () => {
    const r = InvoiceSchema.parse(
      transformInvoice({ ...DOC_INVOICE, currency: 'JPY', total: 1210, subtotal: 1100, tax: 110 }),
    )
    expect(r.subtotal).toBe(1100)
    expect(r.tax).toBe(110)
  })

  it.each([
    ['draft', 'draft'],
    ['open', 'open'],
    ['paid', 'paid'],
    ['void', 'void'],
    ['uncollectible', 'uncollectible'],
    ['deleted', 'unknown'],
  ])('maps documented status %s to %s', (status, want) => {
    expect(InvoiceSchema.parse(transformInvoice({ ...DOC_INVOICE, status })).status).toBe(want)
  })

  it('throws rather than defaulting a missing currency or total', () => {
    expect(() => transformInvoice({ ...DOC_INVOICE, currency: undefined })).toThrow(/currency/)
    expect(() => transformInvoice({ ...DOC_INVOICE, total: undefined })).toThrow(/amount/)
    expect(() => transformInvoice({ ...DOC_INVOICE, id: undefined })).toThrow(/id/)
  })
})

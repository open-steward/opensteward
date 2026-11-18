import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  type RawRebillyInvoice,
} from '../../../../../../../src/verticals/payments/adapters/rebilly/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/payments/schema/invoice'

// Invoice.yaml: invoiceNumber (integer), amount, amountDue, subtotalAmount, currency, status.
const base: RawRebillyInvoice = {
  id: 'in_0YVF9605RKC62BP14NE2R7V2XT',
  invoiceNumber: 7,
  customerId: 'cus_1',
  subscriptionId: 'sub_1',
  currency: 'USD',
  amount: 110,
  amountDue: 0,
  subtotalAmount: 100,
  status: 'paid',
  dueTime: '2026-02-01T00:00:00Z',
  paidTime: '2026-01-20T00:00:00Z',
  createdTime: '2026-01-15T00:00:00Z',
}

describe('rebilly transformInvoice', () => {
  it('maps the documented fields', () => {
    expect(InvoiceSchema.parse(transformInvoice(base))).toMatchObject({
      number: '7',
      total: 11000,
      subtotal: 10000,
      amountDue: 0,
      currency: 'USD',
      status: 'paid',
      paidAt: '2026-01-20T00:00:00Z',
    })
  })

  it.each([
    ['draft', 'draft'],
    ['unpaid', 'open'],
    ['partially-paid', 'open'],
    ['past-due', 'open'],
    ['voided', 'void'],
    ['abandoned', 'uncollectible'],
    ['refunded', 'unknown'],
    ['quotation', 'unknown'],
  ])('maps %s to %s', (raw, status) => {
    expect(InvoiceSchema.parse(transformInvoice({ ...base, status: raw })).status).toBe(status)
  })

  it('omits undocumented money and never defaults a currency', () => {
    const i = transformInvoice({ ...base, amountDue: undefined, subtotalAmount: undefined })
    expect(i.amountDue).toBeUndefined()
    expect(i.subtotal).toBeUndefined()
    expect(() => transformInvoice({ ...base, currency: undefined })).toThrow(/currency/)
  })

  it('reads no undocumented customFields into metadata', () => {
    const raw = { ...base, customFields: { foo: 'bar' } } as RawRebillyInvoice
    expect(InvoiceSchema.parse(transformInvoice(raw)).metadata).toEqual({})
  })
})

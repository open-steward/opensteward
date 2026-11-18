import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type BokioInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/bokio/transform/invoice'
import { INVOICE, INVOICE_WITH_DISCOUNT, copyOf } from '../fixtures'

const invoice = (overrides: Partial<BokioInvoice> = {}): BokioInvoice => ({
  ...copyOf<BokioInvoice>(INVOICE),
  ...overrides,
})

describe('transformInvoice (Bokio, documented invoice)', () => {
  it('maps the documented example and parses against InvoiceSchema', () => {
    const out = InvoiceSchema.parse(transformInvoice(invoice()))
    expect(out).toMatchObject({
      id: 'a419cf69-db6f-4de9-992c-b1a60942a443',
      type: 'INVOICE',
      status: 'DRAFT',
      invoiceNumber: '1234',
      contactId: '55c899c5-82b2-47fa-9c51-e35fc9b26443',
      currency: 'SEK',
      // 10000 / 2500 / 0 SEK, major units → öre
      totalAmount: 1_000_000,
      taxAmount: 250_000,
      paidAmount: 0,
      postedAt: '2024-10-10',
      dueAt: '2024-10-10',
    })
  })

  it('reads the customer from customerRef.id, not an undocumented customerId', () => {
    const out = InvoiceSchema.parse(
      transformInvoice(invoice({ customerId: 'wrong', customerRef: { id: 'cust-uuid' } })),
    )
    expect(out.contactId).toBe('cust-uuid')
  })

  it('reads the tax total from totalTax, not an undocumented vatAmount', () => {
    const out = InvoiceSchema.parse(transformInvoice(invoice({ vatAmount: 1, totalTax: 12.5 })))
    expect(out.taxAmount).toBe(1250)
  })

  it('maps sales and description-only line items from the documented oneOf', () => {
    const out = InvoiceSchema.parse(transformInvoice(invoice()))
    expect(out.lineItems).toEqual([
      { id: '1', itemDescription: 'Product 1', unitAmount: 500_000, unitQuantity: 1 },
      { id: '2', itemDescription: 'Installation work', unitAmount: 50_000, unitQuantity: 10 },
      { id: '3', itemDescription: 'A description line' },
    ])
  })

  it('maps bookkeepingAccountNumber to the chart-of-accounts id space', () => {
    const raw = invoice()
    raw.lineItems = [{ ...raw.lineItems![0]!, bookkeepingAccountNumber: 3001 }]
    const out = InvoiceSchema.parse(transformInvoice(raw))
    expect(out.lineItems?.[0]).toMatchObject({ accountId: '3001', accountCode: '3001' })
  })

  it('leaves a fractional quantity unset instead of failing the integer schema', () => {
    const raw = invoice()
    raw.lineItems = [{ ...raw.lineItems![1]!, quantity: 1.5 }]
    const out = InvoiceSchema.parse(transformInvoice(raw))
    expect(out.lineItems?.[0]?.unitQuantity).toBeUndefined()
    expect(out.lineItems?.[0]?.unitAmount).toBe(50_000)
  })

  it('keeps lineItems unset (not []) when the row carries none', () => {
    const raw = invoice()
    delete raw.lineItems
    expect(InvoiceSchema.parse(transformInvoice(raw)).lineItems).toBeUndefined()
  })

  it.each([
    ['draft', 'DRAFT'],
    ['published', 'AUTHORIZED'],
    ['paid', 'PAID'],
    ['overPaid', 'PAID'],
    ['underPaid', 'PARTIALLY_PAID'],
    ['overdue', 'OVERDUE'],
    ['credited', 'VOIDED'],
    ['credit', 'unknown'],
  ])('maps documented status %s to %s', (status, expected) => {
    expect(InvoiceSchema.parse(transformInvoice(invoice({ status }))).status).toBe(expected)
  })

  it('maps the discounted example too', () => {
    const out = InvoiceSchema.parse(transformInvoice(copyOf<BokioInvoice>(INVOICE_WITH_DISCOUNT)))
    expect(out.totalAmount).toBe(1_125_000)
    expect(out.lineItems).toHaveLength(3)
  })

  it('keeps the raw row as metadata', () => {
    const raw = invoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })
})

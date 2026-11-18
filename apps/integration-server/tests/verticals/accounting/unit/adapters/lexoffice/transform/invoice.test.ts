import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import {
  transformInvoice,
  type LexofficeInvoice,
  type LexofficeLineItem,
} from '../../../../../../../src/verticals/accounting/adapters/lexoffice/transform/invoice'

function makeLineItem(overrides: Partial<LexofficeLineItem> = {}): LexofficeLineItem {
  return {
    type: 'custom',
    name: 'Consulting',
    description: 'Consulting services',
    quantity: 2,
    unitName: 'hour',
    unitPrice: { currency: 'EUR', netAmount: 100, grossAmount: 119, taxRatePercentage: 19 },
    discountPercentage: 0,
    lineItemAmount: 238,
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<LexofficeInvoice> = {}): LexofficeInvoice {
  return {
    id: 'inv-uuid-001',
    organizationId: 'org-uuid-001',
    createdDate: '2024-03-01T08:00:00Z',
    updatedDate: '2024-03-02T10:00:00Z',
    voucherDate: '2024-03-01',
    dueDate: '2024-03-31',
    address: {
      contactId: 'contact-uuid-001',
      name: 'Customer GmbH',
      street: 'Musterstr. 1',
      city: 'Munich',
      zip: '80331',
      countryCode: 'DE',
    },
    lineItems: [makeLineItem()],
    totalPrice: {
      currency: 'EUR',
      totalNetAmount: 200,
      totalGrossAmount: 238,
      totalTaxAmount: 38,
      totalDiscountAbsolute: null,
    },
    taxConditions: { taxType: 'gross' },
    voucherStatus: 'open',
    voucherNumber: 'INV-2024-001',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id correctly', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('inv-uuid-001')
  })

  it('maps voucherNumber to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-2024-001')
  })

  it('maps address.contactId to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('contact-uuid-001')
  })

  it('maps totalPrice.currency to currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('EUR')
  })

  it('maps totalPrice.totalGrossAmount to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(238)
  })

  it('maps totalPrice.totalTaxAmount to taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(38)
  })

  it('parses voucherDate as Date object for postedAt', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('parses dueDate as Date object for dueAt', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-03-31'))
  })

  it('parses createdDate as Date object for createdAt', () => {
    expect(transformInvoice(makeInvoice()).createdAt).toEqual(new Date('2024-03-01T08:00:00Z'))
  })

  it('parses updatedDate as Date object for updatedAt', () => {
    expect(transformInvoice(makeInvoice()).updatedAt).toEqual(new Date('2024-03-02T10:00:00Z'))
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps voucherStatus draft to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ voucherStatus: 'draft' })).status).toBe('DRAFT')
  })

  it('maps voucherStatus open to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ voucherStatus: 'open' })).status).toBe('AUTHORIZED')
  })

  it('maps voucherStatus paid to PAID', () => {
    expect(transformInvoice(makeInvoice({ voucherStatus: 'paid' })).status).toBe('PAID')
  })

  it('maps voucherStatus paidoff to PAID', () => {
    expect(transformInvoice(makeInvoice({ voucherStatus: 'paidoff' })).status).toBe('PAID')
  })

  it('maps voucherStatus sepadebit to PAID', () => {
    expect(transformInvoice(makeInvoice({ voucherStatus: 'sepadebit' })).status).toBe('PAID')
  })

  it('maps voucherStatus voided to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ voucherStatus: 'voided' })).status).toBe('VOIDED')
  })

  it('maps voucherStatus transferred to DRAFT (default)', () => {
    expect(transformInvoice(makeInvoice({ voucherStatus: 'transferred' })).status).toBe('DRAFT')
  })

  it('maps line items correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('0')
    expect(result.lineItems![0].totalAmount).toBe(238)
    expect(result.lineItems![0].unitQuantity).toBe(2)
    expect(result.lineItems![0].unitAmount).toBe(100)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

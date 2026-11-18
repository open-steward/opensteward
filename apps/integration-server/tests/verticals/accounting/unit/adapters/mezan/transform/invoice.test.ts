import { describe, it, expect } from 'vitest'
import {
  transformInvoice,
  untransformInvoice,
  type MezanSalesInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/mezan/transform/invoice'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'

// NOTE: Mezan passes unit_price/subtotal_including_tax directly as integer Amount
// fields. Use integer values so InvoiceSchema.parse() passes.

function makeInvoice(overrides: Partial<MezanSalesInvoice> = {}): MezanSalesInvoice {
  return {
    id: 'inv_001',
    reference: 'INV-100',
    status: 'confirmed',
    issue_date: '2024-03-01',
    due_date: '2024-04-01',
    customer_id: 'cust_42',
    currency: 'USD',
    total: 110000,
    total_tax: 10000,
    total_paid: 110000,
    balance: 0,
    products: [],
    ...overrides,
  }
}

describe('transformInvoice (mezan)', () => {
  it('maps id as string', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('inv_001')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps reference to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-100')
  })

  it('falls back to id as invoiceNumber when reference is absent', () => {
    expect(transformInvoice(makeInvoice({ reference: undefined })).invoiceNumber).toBe('inv_001')
  })

  it('maps customer_id to contactId as string', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('cust_42')
  })

  it('maps currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('USD')
  })

  it('maps total to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(110000)
  })

  it('maps total_tax to taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(10000)
  })

  it('maps total_paid to paidAmount', () => {
    expect(transformInvoice(makeInvoice()).paidAmount).toBe(110000)
  })

  it('maps balance to balanceAmount', () => {
    expect(transformInvoice(makeInvoice()).balanceAmount).toBe(0)
  })

  it('maps issue_date to postedAt as Date', () => {
    expect(transformInvoice(makeInvoice()).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('maps due_date to dueAt as Date', () => {
    expect(transformInvoice(makeInvoice()).dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps confirmed + balance=0 to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'confirmed', balance: 0 })).status).toBe('PAID')
  })

  it('maps confirmed + partial balance to PARTIALLY_PAID', () => {
    expect(
      transformInvoice(makeInvoice({ status: 'confirmed', balance: 55000, total: 110000 })).status,
    ).toBe('PARTIALLY_PAID')
  })

  it('maps confirmed + full balance to AUTHORIZED', () => {
    expect(
      transformInvoice(makeInvoice({ status: 'confirmed', balance: 110000, total: 110000 })).status,
    ).toBe('AUTHORIZED')
  })

  it('maps cancelled to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps draft to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps line items with integer amounts (schema-valid)', () => {
    const raw = makeInvoice({
      products: [
        {
          id: 'p1',
          product_name: 'Service',
          quantity: 2,
          unit_price: 50000,
          subtotal: 100000,
          subtotal_including_tax: 110000,
          tax_subtotal: 10000,
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('p1')
    expect(result.lineItems![0].itemDescription).toBe('Service')
    expect(result.lineItems![0].unitAmount).toBe(50000)
    expect(result.lineItems![0].unitQuantity).toBe(2)
    expect(result.lineItems![0].totalAmount).toBe(110000)
  })

  it('passes raw object as metadata', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('passes InvoiceSchema validation with integer amounts', () => {
    expect(() => InvoiceSchema.parse(transformInvoice(makeInvoice()))).not.toThrow()
  })

  describe('untransformInvoice', () => {
    it('round-trips customer_id via contactId', () => {
      const inv = transformInvoice(makeInvoice())
      const out = untransformInvoice(inv)
      expect(out.customer_id).toBe('cust_42')
    })

    it('round-trips currency', () => {
      const inv = transformInvoice(makeInvoice())
      const out = untransformInvoice(inv)
      expect(out.currency).toBe('USD')
    })

    it('round-trips issue_date from postedAt', () => {
      const inv = transformInvoice(makeInvoice())
      const out = untransformInvoice(inv)
      expect(out.issue_date).toBe('2024-03-01')
    })
  })
})

import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type Unit4Invoice } from '../../../../../../../src/verticals/accounting/adapters/unit4/transform/invoice'

function makeInvoice(overrides: Partial<Unit4Invoice> = {}): Unit4Invoice {
  return {
    invoiceId: 'inv_001',
    invoiceNumber: 'INV-2024-001',
    status: 'Draft',
    customerId: 'cust_42',
    amount: 5000,
    taxAmount: 1000,
    currencyCode: 'USD',
    postingDate: '2024-03-01',
    dueDate: '2024-03-31',
    lines: [],
    ...overrides,
  }
}

describe('transformInvoice (Unit4)', () => {
  it('maps invoiceId to string id', () => {
    expect(transformInvoice(makeInvoice({ invoiceId: 'inv_001' })).id).toBe('inv_001')
  })

  it('maps numeric invoiceId to string', () => {
    expect(transformInvoice(makeInvoice({ invoiceId: 99 })).id).toBe('99')
  })

  it('maps invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-2024-001')
  })

  it('maps amount to totalAmount', () => {
    expect(transformInvoice(makeInvoice({ amount: 7500 })).totalAmount).toBe(7500)
  })

  it('maps taxAmount', () => {
    expect(transformInvoice(makeInvoice({ taxAmount: 500 })).taxAmount).toBe(500)
  })

  it('maps currencyCode to currency', () => {
    expect(transformInvoice(makeInvoice({ currencyCode: 'EUR' })).currency).toBe('EUR')
  })

  it('maps customerId to contactId', () => {
    expect(transformInvoice(makeInvoice({ customerId: 'cust_77' })).contactId).toBe('cust_77')
  })

  it('falls back to supplierId when customerId absent', () => {
    const raw = makeInvoice({ supplierId: 'supp_55' })
    delete raw.customerId
    expect(transformInvoice(raw).contactId).toBe('supp_55')
  })

  it('parses postingDate as Date', () => {
    expect(transformInvoice(makeInvoice({ postingDate: '2024-03-01' })).postedAt).toEqual(new Date('2024-03-01'))
  })

  it('parses dueDate as Date', () => {
    expect(transformInvoice(makeInvoice({ dueDate: '2024-03-31' })).dueAt).toEqual(new Date('2024-03-31'))
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Approved status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'Approved' })).status).toBe('AUTHORIZED')
  })

  it('maps Posted status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'Posted' })).status).toBe('AUTHORIZED')
  })

  it('maps Paid status to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'Paid' })).status).toBe('PAID')
  })

  it('maps Cancelled status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'Cancelled' })).status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'Unknown' })).status).toBe('DRAFT')
  })

  it('maps lines to lineItems', () => {
    const raw = makeInvoice({
      lines: [
        {
          lineId: 'l1',
          description: 'Services',
          quantity: 2,
          unitPrice: 1000,
          lineAmount: 2000,
          taxAmount: 400,
          accountCode: '4000',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('l1')
    expect(li.itemDescription).toBe('Services')
    expect(li.unitAmount).toBe(1000)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(2000)
    expect(li.taxAmount).toBe(400)
    expect(li.accountId).toBe('4000')
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice({ invoiceId: 'inv_001' }))
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

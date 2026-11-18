import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type AccurateInvoice } from '../../../../../../../src/verticals/accounting/adapters/accurate/transform/invoice'

function makeInvoice(overrides: Partial<AccurateInvoice> = {}): AccurateInvoice {
  return {
    id: 1001,
    number: 'SI/2024/001',
    status: 'Open',
    transactionDate: '2024-03-01',
    dueDate: '2024-03-31',
    totalAmount: 11000000,
    taxAmount: 1000000,
    currencyCode: 'IDR',
    customerNo: 'C-001',
    detailItem: [],
    ...overrides,
  }
}

describe('transformInvoice (accurate)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('1001')
    expect(result.invoiceNumber).toBe('SI/2024/001')
    expect(result.contactId).toBe('C-001')
    expect(result.totalAmount).toBe(11000000)
    expect(result.taxAmount).toBe(1000000)
    expect(result.currency).toBe('IDR')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged (reference equality)', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps Open status to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ status: 'Open' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps Closed status to PAID', () => {
    const result = transformInvoice(makeInvoice({ status: 'Closed' }))
    expect(result.status).toBe('PAID')
  })

  it('maps Voided status to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ status: 'Voided' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps detail items to lineItems', () => {
    const raw = makeInvoice({
      detailItem: [
        {
          id: 1,
          itemNo: 'ITEM-001',
          itemName: 'Barang A',
          unitPrice: 500000,
          quantity: 10,
          amount: 5000000,
          taxAmount: 500000,
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemId).toBe('ITEM-001')
    expect(li.itemDescription).toBe('Barang A')
    expect(li.unitAmount).toBe(500000)
    expect(li.unitQuantity).toBe(10)
    expect(li.totalAmount).toBe(5000000)
    expect(li.taxAmount).toBe(500000)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

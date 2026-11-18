import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type ReckonInvoice } from '../../../../../../../src/verticals/accounting/adapters/reckon/transform/invoice'

function makeRaw(overrides: Partial<ReckonInvoice> = {}): ReckonInvoice {
  return {
    id: 'inv-001',
    invoiceNumber: 'INV-0001',
    date: '2024-03-01',
    dueDate: '2024-03-31',
    totalAmount: 1100,
    totalTax: 100,
    balance: 1100,
    subTotal: 1000,
    currencyCode: 'AUD',
    contactId: 'contact-001',
    contactName: 'Acme Pty Ltd',
    status: 'OPEN',
    lineItems: [],
    reference: 'PO-100',
    ...overrides,
  }
}

describe('transformInvoice (reckon)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('inv-001')
    expect(result.type).toBe('INVOICE')
    expect(result.invoiceNumber).toBe('INV-0001')
    expect(result.contactId).toBe('contact-001')
    expect(result.currency).toBe('AUD')
    expect(result.totalAmount).toBe(1100)
    expect(result.taxAmount).toBe(100)
    expect(result.balanceAmount).toBe(1100)
    expect(result.reference).toBe('PO-100')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw as metadata identity', () => {
    const raw = makeRaw()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps DRAFT status', () => {
    expect(transformInvoice(makeRaw({ status: 'DRAFT' })).status).toBe('DRAFT')
  })

  it('maps OPEN to AUTHORIZED', () => {
    expect(transformInvoice(makeRaw({ status: 'OPEN' })).status).toBe('AUTHORIZED')
  })

  it('maps PARTIAL to PARTIALLY_PAID', () => {
    expect(transformInvoice(makeRaw({ status: 'PARTIAL' })).status).toBe('PARTIALLY_PAID')
  })

  it('maps PAID status', () => {
    expect(transformInvoice(makeRaw({ status: 'PAID' })).status).toBe('PAID')
  })

  it('maps VOID to VOIDED', () => {
    expect(transformInvoice(makeRaw({ status: 'VOID' })).status).toBe('VOIDED')
  })

  it('maps OVERDUE status', () => {
    expect(transformInvoice(makeRaw({ status: 'OVERDUE' })).status).toBe('OVERDUE')
  })

  it('calculates paidAmount as totalAmount minus balance', () => {
    const result = transformInvoice(makeRaw({ totalAmount: 1100, balance: 550 }))
    expect(result.paidAmount).toBe(550)
  })

  it('omits paidAmount when balance equals totalAmount', () => {
    const result = transformInvoice(makeRaw({ totalAmount: 1100, balance: 1100 }))
    expect(result.paidAmount).toBeUndefined()
  })

  it('maps line items correctly', () => {
    const raw = makeRaw({
      lineItems: [
        {
          id: 'li-1',
          description: 'Consulting',
          quantity: 2,
          unitAmount: 500,
          amount: 1000,
          taxAmount: 100,
          accountId: 'acc-300',
          accountName: 'Revenue',
          taxCodeId: 'GST',
          discountAmount: 0,
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('li-1')
    expect(li.accountId).toBe('acc-300')
    expect(li.itemDescription).toBe('Consulting')
    expect(li.unitAmount).toBe(500)
    expect(li.unitQuantity).toBe(2)
    expect(li.totalAmount).toBe(1000)
    expect(li.taxAmount).toBe(100)
    expect(li.taxrateId).toBe('GST')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

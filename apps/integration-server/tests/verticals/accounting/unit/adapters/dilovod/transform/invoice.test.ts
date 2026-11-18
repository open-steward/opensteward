import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type DilovodInvoice } from '../../../../../../../src/verticals/accounting/adapters/dilovod/transform/invoice'

function makeInvoice(overrides: Partial<DilovodInvoice> = {}): DilovodInvoice {
  return {
    id: '1',
    number: 'UA-001',
    date: '2024-03-01',
    due_date: '2024-04-01',
    total: 1200,
    tax: 200,
    status: 'draft',
    contractor_id: 'cust-1',
    currency: 'UAH',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('1')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoice number', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('UA-001')
  })

  it('maps total amount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1200)
  })

  it('maps tax amount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(200)
  })

  it('maps draft status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps sent status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'sent' })).status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps voided status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'unknown' })).status).toBe('DRAFT')
  })

  it('maps contactId from contractor_id', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('cust-1')
  })

  it('maps currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('UAH')
  })

  it('maps dates', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps line items', () => {
    const raw = makeInvoice({
      items: [
        { id: 'item-1', name: 'Widget', price: 100, qty: 10, sum: 1000, tax_sum: 200, account_id: 'acc-1' },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('item-1')
    expect(result.lineItems![0].itemDescription).toBe('Widget')
    expect(result.lineItems![0].unitAmount).toBe(100)
    expect(result.lineItems![0].unitQuantity).toBe(10)
    expect(result.lineItems![0].totalAmount).toBe(1000)
    expect(result.lineItems![0].taxAmount).toBe(200)
    expect(result.lineItems![0].accountId).toBe('acc-1')
  })

  it('metadata identity', () => {
    const raw = makeInvoice()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

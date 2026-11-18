import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type TorgsoftInvoice } from '../../../../../../../src/verticals/accounting/adapters/torgsoft/transform/invoice'

function makeInvoice(overrides: Partial<TorgsoftInvoice> = {}): TorgsoftInvoice {
  return {
    id: 'ts-1',
    invoice_number: 'TS-2024-001',
    invoice_date: '2024-03-01',
    due_date: '2024-04-01',
    total_amount: 1200,
    tax_amount: 200,
    status: 'new',
    client_id: 'client-1',
    currency: 'UAH',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('ts-1')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps invoice_number to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('TS-2024-001')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1200)
  })

  it('maps tax_amount to taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(200)
  })

  it('maps new status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'new' })).status).toBe('DRAFT')
  })

  it('maps confirmed status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'confirmed' })).status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps cancelled status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps client_id to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('client-1')
  })

  it('maps currency', () => {
    expect(transformInvoice(makeInvoice()).currency).toBe('UAH')
  })

  it('maps dates', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps line items with title as description', () => {
    const raw = makeInvoice({
      items: [
        { id: 'item-1', title: 'Товар А', price: 600, quantity: 2, total: 1200, tax: 200, account_id: 'acc-1' },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemDescription).toBe('Товар А')
    expect(result.lineItems![0].unitAmount).toBe(600)
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

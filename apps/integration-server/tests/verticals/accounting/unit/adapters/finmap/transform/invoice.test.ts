import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type FinmapInvoice } from '../../../../../../../src/verticals/accounting/adapters/finmap/transform/invoice'

function makeInvoice(overrides: Partial<FinmapInvoice> = {}): FinmapInvoice {
  return {
    id: 'inv-1',
    name: 'INV-2024-001',
    date: '2024-03-01',
    dueDate: '2024-04-01',
    amount: 1000,
    amountWithTax: 1200,
    taxAmount: 200,
    status: 'draft',
    counterpartyId: 'cp-1',
    currency: 'UAH',
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps id', () => {
    expect(transformInvoice(makeInvoice()).id).toBe('inv-1')
  })

  it('sets type to INVOICE', () => {
    expect(transformInvoice(makeInvoice()).type).toBe('INVOICE')
  })

  it('maps name to invoiceNumber', () => {
    expect(transformInvoice(makeInvoice()).invoiceNumber).toBe('INV-2024-001')
  })

  it('maps amountWithTax as totalAmount', () => {
    expect(transformInvoice(makeInvoice()).totalAmount).toBe(1200)
  })

  it('falls back to amount when amountWithTax is absent', () => {
    expect(transformInvoice(makeInvoice({ amountWithTax: undefined })).totalAmount).toBe(1000)
  })

  it('maps taxAmount', () => {
    expect(transformInvoice(makeInvoice()).taxAmount).toBe(200)
  })

  it('maps draft status to DRAFT', () => {
    expect(transformInvoice(makeInvoice({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps active status to AUTHORIZED', () => {
    expect(transformInvoice(makeInvoice({ status: 'active' })).status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    expect(transformInvoice(makeInvoice({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps deleted status to VOIDED', () => {
    expect(transformInvoice(makeInvoice({ status: 'deleted' })).status).toBe('VOIDED')
  })

  it('maps counterpartyId to contactId', () => {
    expect(transformInvoice(makeInvoice()).contactId).toBe('cp-1')
  })

  it('maps dates', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-04-01'))
  })

  it('maps line items', () => {
    const raw = makeInvoice({
      items: [
        { id: 'li-1', name: 'Service', price: 500, count: 2, total: 1000, tax: 200 },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].unitQuantity).toBe(2)
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

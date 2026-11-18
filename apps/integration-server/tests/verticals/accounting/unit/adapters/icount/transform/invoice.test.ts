import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type ICountInvoice } from '../../../../../../../src/verticals/accounting/adapters/icount/transform/invoice'

function makeInvoice(overrides: Partial<ICountInvoice> = {}): ICountInvoice {
  return {
    doc_id: 'doc_100',
    doc_type: 'invrec',
    status: 'open',
    sum: 5000,
    vat_sum: 850,
    currency_code: 'ILS',
    client_id: 'clt_1',
    date: '2024-03-01',
    due_date: '2024-03-31',
    doc_number: 'INV-100',
    description: 'Services rendered',
    ...overrides,
  }
}

describe('transformInvoice (icount)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('doc_100')
    expect(result.invoiceNumber).toBe('INV-100')
    expect(result.contactId).toBe('clt_1')
    expect(result.totalAmount).toBe(5000)
    expect(result.taxAmount).toBe(850)
    expect(result.currency).toBe('ILS')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps status draft to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status open to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ status: 'open' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps status paid to PAID', () => {
    const result = transformInvoice(makeInvoice({ status: 'paid' }))
    expect(result.status).toBe('PAID')
  })

  it('maps status cancelled to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ status: 'cancelled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('handles missing due_date', () => {
    const result = transformInvoice(makeInvoice({ due_date: undefined }))
    expect(result.dueAt).toBeUndefined()
  })

  it('handles missing client_id', () => {
    const result = transformInvoice(makeInvoice({ client_id: undefined }))
    expect(result.contactId).toBeUndefined()
  })

  it('maps description to notes', () => {
    const result = transformInvoice(makeInvoice({ description: 'A note' }))
    expect(result.notes).toBe('A note')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type InvoiceXpressInvoice } from '../../../../../../../src/verticals/accounting/adapters/invoicexpress/transform/invoice'

function makeInvoice(overrides: Partial<InvoiceXpressInvoice> = {}): InvoiceXpressInvoice {
  return {
    id: 1001,
    status: { name: 'draft' },
    sequence_number: 'FT 2024/1',
    date: '2024-01-15',
    due_date: '2024-02-15',
    currency: 'EUR',
    total: 1230,
    tax_amount: 230,
    client: { id: 99 },
    ...overrides,
  }
}

describe('transformInvoice', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('1001')
    expect(result.invoiceNumber).toBe('FT 2024/1')
    expect(result.contactId).toBe('99')
    expect(result.totalAmount).toBe(1230)
    expect(result.taxAmount).toBe(230)
    expect(result.currency).toBe('EUR')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice({ sequence_number: 'FT 2024/99' })
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps draft status to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ status: { name: 'draft' } }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps sent status to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ status: { name: 'sent' } }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps settled status to PAID', () => {
    const result = transformInvoice(makeInvoice({ status: { name: 'settled' } }))
    expect(result.status).toBe('PAID')
  })

  it('maps canceled status to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ status: { name: 'canceled' } }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps second_copy status to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ status: { name: 'second_copy' } }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps unknown status to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ status: { name: 'unknown' } }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps client.id to contactId', () => {
    const result = transformInvoice(makeInvoice({ client: { id: 42 } }))
    expect(result.contactId).toBe('42')
  })

  it('returns undefined tax_amount when zero', () => {
    const result = transformInvoice(makeInvoice({ tax_amount: 0 }))
    expect(result.taxAmount).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

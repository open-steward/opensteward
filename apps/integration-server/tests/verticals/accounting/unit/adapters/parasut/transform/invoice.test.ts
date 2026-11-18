import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type ParasutInvoice } from '../../../../../../../src/verticals/accounting/adapters/parasut/transform/invoice'

function makeInvoice(overrides: Partial<ParasutInvoice> = {}): ParasutInvoice {
  return {
    id: 'inv_1',
    type: 'e_invoices',
    attributes: {
      item_type: 'invoice',
      status: 'draft',
      invoice_no: 'INV-001',
      net_total: 1000,
      gross_total: 1200,
      vat_total: 200,
      due_date: '2024-02-15',
      issue_date: '2024-01-15',
      currency: 'TRY',
    },
    ...overrides,
  }
}

describe('transformInvoice (parasut)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.id).toBe('inv_1')
    expect(result.type).toBe('INVOICE')
    expect(result.invoiceNumber).toBe('INV-001')
    expect(result.totalAmount).toBe(1200)
    expect(result.taxAmount).toBe(200)
    expect(result.currency).toBe('TRY')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeInvoice())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
    expect(result.dueAt).toEqual(new Date('2024-02-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeInvoice()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps draft status to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ attributes: { ...makeInvoice().attributes, status: 'draft' } }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps sent status to AUTHORIZED', () => {
    const result = transformInvoice(makeInvoice({ attributes: { ...makeInvoice().attributes, status: 'sent' } }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    const result = transformInvoice(makeInvoice({ attributes: { ...makeInvoice().attributes, status: 'paid' } }))
    expect(result.status).toBe('PAID')
  })

  it('maps cancelled status to VOIDED', () => {
    const result = transformInvoice(makeInvoice({ attributes: { ...makeInvoice().attributes, status: 'cancelled' } }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps unknown status to DRAFT', () => {
    const result = transformInvoice(makeInvoice({ attributes: { ...makeInvoice().attributes, status: 'unknown' } }))
    expect(result.status).toBe('DRAFT')
  })

  it('handles missing optional fields gracefully', () => {
    const raw: ParasutInvoice = { id: 'inv_2', type: 'e_invoices', attributes: {} }
    const result = transformInvoice(raw)
    expect(result.id).toBe('inv_2')
    expect(result.invoiceNumber).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.postedAt).toBeUndefined()
    expect(result.dueAt).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeInvoice())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

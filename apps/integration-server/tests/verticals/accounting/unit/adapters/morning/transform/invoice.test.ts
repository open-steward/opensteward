import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type MorningDocument } from '../../../../../../../src/verticals/accounting/adapters/morning/transform/invoice'

function makeDocument(overrides: Partial<MorningDocument> = {}): MorningDocument {
  return {
    id: 'doc_001',
    type: 320,
    status: 1,
    number: 'INV-001',
    sum: 5000,
    vat: 850,
    currency: 'ILS',
    date: '2024-03-01',
    dueDate: '2024-03-31',
    client: { id: 'client_1' },
    description: 'Test invoice',
    ...overrides,
  }
}

describe('transformInvoice (morning)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeDocument())
    expect(result.id).toBe('doc_001')
    expect(result.invoiceNumber).toBe('INV-001')
    expect(result.contactId).toBe('client_1')
    expect(result.totalAmount).toBe(5000)
    expect(result.taxAmount).toBe(850)
    expect(result.currency).toBe('ILS')
    expect(result.type).toBe('INVOICE')
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeDocument())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeDocument()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps status 0 to DRAFT', () => {
    const result = transformInvoice(makeDocument({ status: 0 }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status 1 to AUTHORIZED', () => {
    const result = transformInvoice(makeDocument({ status: 1 }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps status 2 to PAID', () => {
    const result = transformInvoice(makeDocument({ status: 2 }))
    expect(result.status).toBe('PAID')
  })

  it('maps status -1 to VOIDED', () => {
    const result = transformInvoice(makeDocument({ status: -1 }))
    expect(result.status).toBe('VOIDED')
  })

  it('handles missing dueDate', () => {
    const result = transformInvoice(makeDocument({ dueDate: undefined }))
    expect(result.dueAt).toBeUndefined()
  })

  it('handles missing client', () => {
    const result = transformInvoice(makeDocument({ client: undefined }))
    expect(result.contactId).toBeUndefined()
  })

  it('maps description to notes', () => {
    const result = transformInvoice(makeDocument({ description: 'Note here' }))
    expect(result.notes).toBe('Note here')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeDocument())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

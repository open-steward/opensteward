import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type PaperlessDocument } from '../../../../../../../src/verticals/accounting/adapters/paperlessngx/transform/invoice'

function makeDocument(overrides: Partial<PaperlessDocument> = {}): PaperlessDocument {
  return {
    id: 42,
    title: 'Invoice from Supplier',
    created: '2024-03-01T00:00:00Z',
    correspondent: 7,
    document_type: 1,
    tags: [],
    archived_file_name: 'invoice-2024.pdf',
    ...overrides,
  }
}

describe('transformInvoice (Paperless-ngx)', () => {
  it('maps id and title correctly', () => {
    const result = transformInvoice(makeDocument())
    expect(result.id).toBe('42')
    expect(result.type).toBe('INVOICE')
  })

  it('parses created date', () => {
    const result = transformInvoice(makeDocument())
    expect(result.postedAt).toEqual(new Date('2024-03-01T00:00:00Z'))
  })

  it('maps correspondent as contactId', () => {
    const result = transformInvoice(makeDocument())
    expect(result.contactId).toBe('7')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeDocument()
    expect(transformInvoice(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeDocument())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawPdffillerTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/pdffiller/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

describe('pdffiller transformTemplate', () => {
  const raw: RawPdffillerTemplate = {
    id: 77,
    name: 'Standard NDA',
    type: 'PDF',
    created: '2026-01-05T09:00:00.000Z',
    folder: 3,
    fillable_fields: [{ name: 'Signature' }, { name: 'Date' }],
    pages_count: 4,
  }

  it('maps id and externalId from template id', () => {
    const result = transformTemplate(raw)
    expect(result.id).toBe('77')
    expect(result.externalId).toBe('77')
  })

  it('maps name from name field', () => {
    const result = transformTemplate(raw)
    expect(result.name).toBe('Standard NDA')
  })

  it('always sets signerRoles to empty array (pdfFiller templates have no roles)', () => {
    const result = transformTemplate(raw)
    expect(result.signerRoles).toEqual([])
  })

  it('always sets documentCount to 1', () => {
    const result = transformTemplate(raw)
    expect(result.documentCount).toBe(1)
  })

  it('maps createdAt as ISO datetime', () => {
    const result = transformTemplate(raw)
    expect(result.createdAt).toBe('2026-01-05T09:00:00.000Z')
  })

  it('sets platform to pdffiller', () => {
    const result = transformTemplate(raw)
    expect(result.platform).toBe('pdffiller')
  })

  it('includes fillableFieldCount in metadata', () => {
    const result = transformTemplate(raw)
    expect(result.metadata.fillableFieldCount).toBe('2')
  })

  it('includes pagesCount in metadata', () => {
    const result = transformTemplate(raw)
    expect(result.metadata.pagesCount).toBe('4')
  })

  it('passes TemplateSchema.parse without throwing', () => {
    const result = transformTemplate(raw)
    expect(() => TemplateSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/documenso/transform/document'
import type { RawDocumensoDocument } from '../../../../../../../src/verticals/docsign/adapters/documenso/transform/envelope'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('documenso transformDocument', () => {
  it('maps a document with title', () => {
    const raw: RawDocumensoDocument = {
      id: 42,
      title: 'Master Services Agreement',
      status: 'COMPLETED',
      documentDataId: 'data-abc',
      source: 'UPLOAD',
      visibility: 'EVERYONE',
    }
    const result = transformDocument(raw, 0)

    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
    // envelopeId == externalId for documenso (document IS the envelope)
    expect(result.envelopeId).toBe('42')
    expect(result.name).toBe('Master Services Agreement')
    expect(result.mimeType).toBe('application/pdf')
    expect(result.order).toBe(0)
    expect(result.platform).toBe('documenso')
    expect(result.metadata.documentDataId).toBe('data-abc')
    expect(result.metadata.source).toBe('UPLOAD')
    expect(result.metadata.visibility).toBe('EVERYONE')

    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('uses fallback name when title absent', () => {
    const raw: RawDocumensoDocument = {
      id: 99,
      status: 'DRAFT',
    }
    const result = transformDocument(raw)

    expect(result.name).toBe('document-99')
    expect(result.order).toBe(0)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('uses the index as order when provided', () => {
    const raw: RawDocumensoDocument = {
      id: 5,
      title: 'Annex A',
      status: 'PENDING',
    }
    const result = transformDocument(raw, 3)

    expect(result.order).toBe(3)
    expect(result.name).toBe('Annex A')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('never exposes sizeBytes or pageCount (documenso has no file size API)', () => {
    const raw: RawDocumensoDocument = {
      id: 10,
      title: 'Invoice',
      status: 'COMPLETED',
    }
    const result = transformDocument(raw)

    expect(result.sizeBytes).toBeUndefined()
    expect(result.pageCount).toBeUndefined()
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})

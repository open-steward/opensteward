import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawAnnatureDocument,
} from '../../../../../../../src/verticals/docsign/adapters/annature/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { DOCUMENT_EXAMPLE } from './fixtures'

describe('annature transformDocument', () => {
  it('maps the documented document example onto the canonical schema', () => {
    const out = DocumentSchema.parse(
      transformDocument(DOCUMENT_EXAMPLE as RawAnnatureDocument, 'env-1', 2),
    )
    expect(out.id).toBe('fcad499b03c6fc222bc66208317a18c9')
    expect(out.externalId).toBe('fcad499b03c6fc222bc66208317a18c9')
    expect(out.envelopeId).toBe('env-1')
    expect(out.name).toBe('Non disclosure agreement.pdf')
    expect(out.pageCount).toBe(10)
    expect(out.sizeBytes).toBeUndefined()
    expect(out.mimeType).toBe('application/pdf')
    expect(out.order).toBe(2)
    expect(out.metadata).toEqual({ created: '2019-12-17T05:30:00Z' })
    expect(out.platform).toBe('annature')
  })

  it('drops the original and master download links from raw', () => {
    const raw = transformDocument(DOCUMENT_EXAMPLE as RawAnnatureDocument, 'e', 0).raw as Record<
      string,
      unknown
    >
    expect(raw).not.toHaveProperty('original')
    expect(raw).not.toHaveProperty('master')
    expect(raw['name']).toBe('Non disclosure agreement.pdf')
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawZefortDocument,
} from '../../../../../../../src/verticals/docsign/adapters/zefort/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('Zefort transformDocument', () => {
  it('maps a fully-populated document to the canonical Document shape', () => {
    const raw: RawZefortDocument = {
      id: 'esdc_abc123',
      filename: 'contract.pdf',
      content_type: 'application/pdf',
      num_pages: 5,
      signable: true,
      needs_to_be_viewed: false,
      status: 'signed',
    }
    const result = transformDocument(raw, 'esgn_env001', 0)

    // id / externalId come from raw.id
    expect(result.id).toBe('esdc_abc123')
    expect(result.externalId).toBe('esdc_abc123')
    // envelopeId is passed through
    expect(result.envelopeId).toBe('esgn_env001')
    // name from filename
    expect(result.name).toBe('contract.pdf')
    // page count from num_pages
    expect(result.pageCount).toBe(5)
    // mime from content_type
    expect(result.mimeType).toBe('application/pdf')
    // order is passed through
    expect(result.order).toBe(0)
    // platform
    expect(result.platform).toBe('zefort')
    // metadata carries signable / needsToBeViewed / status
    expect(result.metadata.signable).toBe('true')
    expect(result.metadata.needsToBeViewed).toBe('false')
    expect(result.metadata.status).toBe('signed')

    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('falls back to "<envelopeId>:<order>" id and default mime when fields are absent', () => {
    const raw: RawZefortDocument = {}
    const result = transformDocument(raw, 'esgn_env002', 2)

    // fallback id
    expect(result.id).toBe('esgn_env002:2')
    expect(result.externalId).toBe('esgn_env002:2')
    // fallback name
    expect(result.name).toBe('document-2')
    // fallback mime
    expect(result.mimeType).toBe('application/pdf')
    // no pageCount
    expect(result.pageCount).toBeUndefined()

    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})

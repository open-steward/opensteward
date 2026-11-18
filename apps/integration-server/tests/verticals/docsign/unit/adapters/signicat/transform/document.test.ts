import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawSignicatDocumentRef,
} from '../../../../../../../src/verticals/docsign/adapters/signicat/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('signicat transformDocument', () => {
  it('maps a document reference to canonical Document with PDF mime type', () => {
    const raw: RawSignicatDocumentRef = {
      documentId: 'doc-001',
      documentCollectionId: 'col-abc',
      action: 'SIGN',
      description: 'Non-Disclosure Agreement',
    }
    const result = transformDocument(raw, 'session-1', 0)

    expect(result.id).toBe('doc-001')
    expect(result.externalId).toBe('doc-001')
    expect(result.envelopeId).toBe('session-1')
    expect(result.name).toBe('Non-Disclosure Agreement')
    expect(result.mimeType).toBe('application/pdf')
    expect(result.order).toBe(0)
    expect(result.platform).toBe('signicat')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('falls back to documentId as name when description is absent', () => {
    const raw: RawSignicatDocumentRef = {
      documentId: 'doc-002',
      action: 'VIEW',
    }
    const result = transformDocument(raw, 'session-1', 1)

    expect(result.name).toBe('doc-002')
    expect(result.order).toBe(1)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('falls back to index-based id when documentId is absent', () => {
    const raw: RawSignicatDocumentRef = {
      documentCollectionId: 'col-xyz',
      description: 'Contract',
    }
    const result = transformDocument(raw, 'session-2', 3)

    expect(result.id).toBe('session-2:3')
    expect(result.name).toBe('Contract')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})

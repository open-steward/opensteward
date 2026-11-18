import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawSertifiDocument,
} from '../../../../../../../src/verticals/docsign/adapters/sertifi/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('sertifi transformDocument', () => {
  it('maps a raw Sertifi document to canonical Document', () => {
    const raw: RawSertifiDocument = {
      documentId: 'doc-001',
      filename: 'contract.pdf',
      title: 'Service Agreement',
      documentStatus: 'Signed',
      createdAt: '2026-01-10T09:00:00.000Z',
      signedAt: '2026-01-15T12:00:00.000Z',
      isExpired: false,
    }

    const result = transformDocument(raw, 'folder-001', 0)

    // id is composed of envelopeId + externalId
    expect(result.id).toBe('folder-001:doc-001')
    expect(result.externalId).toBe('doc-001')
    expect(result.envelopeId).toBe('folder-001')
    // title preferred over filename for name
    expect(result.name).toBe('Service Agreement')
    // Sertifi documents are always application/pdf
    expect(result.mimeType).toBe('application/pdf')
    expect(result.order).toBe(0)
    expect(result.platform).toBe('sertifi')
    expect(result.metadata.documentStatus).toBe('Signed')

    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('falls back to filename when title absent', () => {
    const raw: RawSertifiDocument = {
      documentId: 'doc-002',
      filename: 'attachment.pdf',
    }
    const result = transformDocument(raw, 'env-1', 1)
    expect(result.name).toBe('attachment.pdf')
  })

  it('falls back to compound id when documentId absent', () => {
    const raw: RawSertifiDocument = {}
    const result = transformDocument(raw, 'env-1', 2)
    // externalId is the compound fallback
    expect(result.externalId).toBe('env-1:2')
    expect(result.id).toBe('env-1:env-1:2')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})

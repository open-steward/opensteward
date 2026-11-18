import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/opensign/transform/document'
import type { RawOpensignDocument } from '../../../../../../../src/verticals/docsign/adapters/opensign/transform/envelope'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('opensign transformDocument', () => {
  const raw: RawOpensignDocument = {
    objectId: 'doc_os_001',
    Name: 'NDA Agreement',
    URL: 'https://opensign.example/docs/doc_os_001.pdf',
    CertificateUrl: 'https://opensign.example/certs/doc_os_001.pdf',
    IsSignyourself: false,
    Pages: 12,
  }

  it('maps id from objectId', () => {
    const result = transformDocument(raw)
    expect(result.id).toBe('doc_os_001')
  })

  it('maps externalId from objectId', () => {
    const result = transformDocument(raw)
    expect(result.externalId).toBe('doc_os_001')
  })

  it('maps envelopeId from objectId', () => {
    const result = transformDocument(raw)
    expect(result.envelopeId).toBe('doc_os_001')
  })

  it('maps name from Name field', () => {
    const result = transformDocument(raw)
    expect(result.name).toBe('NDA Agreement')
  })

  it('maps empty string name when Name is absent', () => {
    const result = transformDocument({ ...raw, Name: undefined })
    expect(result.name).toBe('')
  })

  it('maps mimeType to application/pdf (always PDF)', () => {
    const result = transformDocument(raw)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('maps order to 0 (single document per envelope)', () => {
    const result = transformDocument(raw)
    expect(result.order).toBe(0)
  })

  it('maps pageCount from Pages field', () => {
    const result = transformDocument(raw)
    expect(result.pageCount).toBe(12)
  })

  it('leaves pageCount undefined when Pages is absent', () => {
    const result = transformDocument({ ...raw, Pages: undefined })
    expect(result.pageCount).toBeUndefined()
  })

  it('sets platform to opensign', () => {
    const result = transformDocument(raw)
    expect(result.platform).toBe('opensign')
  })

  it('includes hasCertificate in metadata when CertificateUrl is present', () => {
    const result = transformDocument(raw)
    expect(result.metadata.hasCertificate).toBe('true')
  })

  it('omits hasCertificate from metadata when CertificateUrl is absent', () => {
    const result = transformDocument({ ...raw, CertificateUrl: undefined })
    expect(result.metadata.hasCertificate).toBeUndefined()
  })

  it('passes DocumentSchema.parse without throwing', () => {
    const result = transformDocument(raw)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/signrequest/transform/document'
import type { RawSignRequestDocument } from '../../../../../../../src/verticals/docsign/adapters/signrequest/transform/envelope'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

const rawDoc: RawSignRequestDocument = {
  uuid: 'doc-uuid-abc',
  name: 'NDA.pdf',
  status: 'se',
  external_id: 'ext-123',
  frontend_id: 'fe-456',
  security_hash: 'sha256:abc',
}

describe('signrequest transformDocument', () => {
  it('maps uuid to id, externalId, and envelopeId', () => {
    const result = transformDocument(rawDoc)
    expect(result.id).toBe('doc-uuid-abc')
    expect(result.externalId).toBe('doc-uuid-abc')
    expect(result.envelopeId).toBe('doc-uuid-abc')
  })

  it('maps name from raw.name', () => {
    const result = transformDocument(rawDoc)
    expect(result.name).toBe('NDA.pdf')
  })

  it('falls back to uuid.pdf when name is null', () => {
    const result = transformDocument({ ...rawDoc, name: null })
    expect(result.name).toBe('doc-uuid-abc.pdf')
  })

  it('sets mimeType to application/pdf', () => {
    const result = transformDocument(rawDoc)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('sets order to 0', () => {
    const result = transformDocument(rawDoc)
    expect(result.order).toBe(0)
  })

  it('sets platform to signrequest', () => {
    const result = transformDocument(rawDoc)
    expect(result.platform).toBe('signrequest')
  })

  it('puts status and securityHash into metadata', () => {
    const result = transformDocument(rawDoc)
    expect(result.metadata.status).toBe('se')
    expect(result.metadata.securityHash).toBe('sha256:abc')
  })

  it('puts externalId and frontendId into metadata', () => {
    const result = transformDocument(rawDoc)
    expect(result.metadata.externalId).toBe('ext-123')
    expect(result.metadata.frontendId).toBe('fe-456')
  })

  it('passes DocumentSchema.parse without throwing', () => {
    const result = transformDocument(rawDoc)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/secured-signing/transform/document'
import type { RawSecuredSigningDocument } from '../../../../../../../src/verticals/docsign/adapters/secured-signing/transform/envelope'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('secured-signing transformDocument', () => {
  const raw: RawSecuredSigningDocument = {
    Reference: 'REF-001',
    Name: 'Partnership Agreement',
    Status: 'Complete',
    PackageReference: 'PKG-001',
    ClientReference: 'CLIENT-001',
    HasFileUploaded: true,
  }

  const envelopeId = 'REF-001'

  it('maps id and externalId from Reference', () => {
    const result = transformDocument(raw, envelopeId)
    expect(result.id).toBe('REF-001')
    expect(result.externalId).toBe('REF-001')
  })

  it('maps name from Name', () => {
    const result = transformDocument(raw, envelopeId)
    expect(result.name).toBe('Partnership Agreement')
  })

  it('always sets mimeType to application/pdf', () => {
    const result = transformDocument(raw, envelopeId)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('sets order to 0', () => {
    const result = transformDocument(raw, envelopeId)
    expect(result.order).toBe(0)
  })

  it('sets envelopeId', () => {
    const result = transformDocument(raw, envelopeId)
    expect(result.envelopeId).toBe('REF-001')
  })

  it('sets platform to secured-signing', () => {
    const result = transformDocument(raw, envelopeId)
    expect(result.platform).toBe('secured-signing')
  })

  it('includes packageReference in metadata', () => {
    const result = transformDocument(raw, envelopeId)
    expect(result.metadata.packageReference).toBe('PKG-001')
  })

  it('falls back to envelopeId as reference when Reference is absent', () => {
    const result = transformDocument({ ...raw, Reference: undefined }, envelopeId)
    expect(result.id).toBe('REF-001')
    expect(result.externalId).toBe('REF-001')
  })

  it('passes DocumentSchema.parse without throwing', () => {
    const result = transformDocument(raw, envelopeId)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})

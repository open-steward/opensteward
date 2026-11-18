import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawFpSignDocument,
} from '../../../../../../../src/verticals/docsign/adapters/fp-sign/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('fp-sign transformDocument', () => {
  const envelopeId = '123'

  const baseRaw: RawFpSignDocument = {
    id: 77,
    name: 'Agreement.pdf',
    documentType: 'main',
    hashValue: 'abc123def456',
  }

  it('maps id from raw.id', () => {
    const result = transformDocument(baseRaw, envelopeId, 0)
    expect(result.id).toBe('77')
    expect(result.externalId).toBe('77')
  })

  it('maps envelopeId', () => {
    const result = transformDocument(baseRaw, envelopeId, 0)
    expect(result.envelopeId).toBe('123')
  })

  it('maps name from raw.name', () => {
    const result = transformDocument(baseRaw, envelopeId, 0)
    expect(result.name).toBe('Agreement.pdf')
  })

  it('always sets mimeType to application/pdf', () => {
    const result = transformDocument(baseRaw, envelopeId, 0)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('maps order parameter', () => {
    const result = transformDocument(baseRaw, envelopeId, 2)
    expect(result.order).toBe(2)
  })

  it('sets platform to fp-sign', () => {
    const result = transformDocument(baseRaw, envelopeId, 0)
    expect(result.platform).toBe('fp-sign')
  })

  it('falls back to synthesized id when raw.id is absent', () => {
    const result = transformDocument({ ...baseRaw, id: undefined }, envelopeId, 1)
    expect(result.id).toBe(`${envelopeId}:doc:1`)
    expect(result.externalId).toBe(`${envelopeId}:doc:1`)
  })

  it('falls back name to document-<order> when raw.name is absent', () => {
    const result = transformDocument({ ...baseRaw, name: undefined }, envelopeId, 3)
    expect(result.name).toBe('document-3')
  })

  it('does not expose content (base64 PDF firewall)', () => {
    const result = transformDocument(baseRaw, envelopeId, 0)
    expect((result as Record<string, unknown>)['content']).toBeUndefined()
    expect((result as Record<string, unknown>)['url']).toBeUndefined()
  })

  it('produces a schema-valid Document', () => {
    const result = transformDocument(baseRaw, envelopeId, 0)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})

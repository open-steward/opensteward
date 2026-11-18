import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawGmoSignDocument,
} from '../../../../../../../src/verticals/docsign/adapters/gmo-sign/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('gmo-sign transformDocument', () => {
  const envelopeId = 'GMO-XID-001'

  const baseRaw: RawGmoSignDocument = {
    control_number: 'CN-001',
    document_name: 'Contract.pdf',
    document_code: 'DOC-A',
  }

  it('composes id as envelopeId:control_number', () => {
    const result = transformDocument(baseRaw, envelopeId, 0)
    expect(result.id).toBe('GMO-XID-001:CN-001')
  })

  it('maps externalId from control_number', () => {
    const result = transformDocument(baseRaw, envelopeId, 0)
    expect(result.externalId).toBe('CN-001')
  })

  it('maps envelopeId', () => {
    const result = transformDocument(baseRaw, envelopeId, 0)
    expect(result.envelopeId).toBe('GMO-XID-001')
  })

  it('maps document_name to name', () => {
    const result = transformDocument(baseRaw, envelopeId, 0)
    expect(result.name).toBe('Contract.pdf')
  })

  it('maps order parameter', () => {
    const result = transformDocument(baseRaw, envelopeId, 2)
    expect(result.order).toBe(2)
  })

  it('sets platform to gmo-sign', () => {
    const result = transformDocument(baseRaw, envelopeId, 0)
    expect(result.platform).toBe('gmo-sign')
  })

  it('falls back externalId to documentId when control_number absent', () => {
    const result = transformDocument(
      { ...baseRaw, control_number: undefined, documentId: 'DOC-99' },
      envelopeId,
      0,
    )
    expect(result.externalId).toBe('DOC-99')
  })

  it('falls back externalId to document_code when control_number and documentId absent', () => {
    const result = transformDocument(
      { ...baseRaw, control_number: undefined, documentId: undefined },
      envelopeId,
      0,
    )
    expect(result.externalId).toBe('DOC-A')
  })

  it('falls back externalId to order index string when all id fields absent', () => {
    const result = transformDocument(
      { control_number: undefined, documentId: undefined, document_code: undefined },
      envelopeId,
      5,
    )
    expect(result.externalId).toBe('5')
  })

  it('does not expose file content or url', () => {
    const result = transformDocument(baseRaw, envelopeId, 0)
    expect((result as Record<string, unknown>)['content']).toBeUndefined()
    expect((result as Record<string, unknown>)['url']).toBeUndefined()
  })

  it('produces a schema-valid Document', () => {
    const result = transformDocument(baseRaw, envelopeId, 0)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})

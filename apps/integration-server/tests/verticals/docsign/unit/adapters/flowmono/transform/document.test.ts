import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawFlowmonoDocument,
} from '../../../../../../../src/verticals/docsign/adapters/flowmono/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('flowmono transformDocument', () => {
  const envelopeId = 'REF-001'

  const baseRaw: RawFlowmonoDocument = {
    id: 42,
    name: 'Contract.pdf',
    fileName: 'Contract.pdf',
    mimeType: 'application/pdf',
    extension: 'pdf',
    fileUrl: 'https://example.com/file.pdf',
    fileSize: 102400,
    pageCount: 5,
  }

  it('composes id as envelopeId:docId', () => {
    const result = transformDocument(baseRaw, envelopeId)
    expect(result.id).toBe('REF-001:42')
  })

  it('maps externalId from raw.id', () => {
    const result = transformDocument(baseRaw, envelopeId)
    expect(result.externalId).toBe('42')
  })

  it('maps envelopeId correctly', () => {
    const result = transformDocument(baseRaw, envelopeId)
    expect(result.envelopeId).toBe('REF-001')
  })

  it('maps name from raw.name', () => {
    const result = transformDocument(baseRaw, envelopeId)
    expect(result.name).toBe('Contract.pdf')
  })

  it('maps mimeType from raw.mimeType', () => {
    const result = transformDocument(baseRaw, envelopeId)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('infers application/pdf mimeType from extension when mimeType is absent', () => {
    const result = transformDocument({ ...baseRaw, mimeType: undefined }, envelopeId)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('maps fileSize to sizeBytes', () => {
    const result = transformDocument(baseRaw, envelopeId)
    expect(result.sizeBytes).toBe(102400)
  })

  it('maps pageCount', () => {
    const result = transformDocument(baseRaw, envelopeId)
    expect(result.pageCount).toBe(5)
  })

  it('sets order to 0', () => {
    const result = transformDocument(baseRaw, envelopeId)
    expect(result.order).toBe(0)
  })

  it('sets platform to flowmono', () => {
    const result = transformDocument(baseRaw, envelopeId)
    expect(result.platform).toBe('flowmono')
  })

  it('falls back to fileName for id when id is missing', () => {
    const result = transformDocument({ ...baseRaw, id: undefined }, envelopeId)
    expect(result.id).toBe('REF-001:Contract.pdf')
  })

  it('fileUrl does not appear at top level (content firewall)', () => {
    const result = transformDocument(baseRaw, envelopeId)
    expect((result as Record<string, unknown>)['fileUrl']).toBeUndefined()
    expect((result as Record<string, unknown>)['url']).toBeUndefined()
  })

  it('produces a schema-valid Document', () => {
    const result = transformDocument(baseRaw, envelopeId)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})

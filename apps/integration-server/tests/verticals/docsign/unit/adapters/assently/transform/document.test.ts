import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawAssentlyDocument,
} from '../../../../../../../src/verticals/docsign/adapters/assently/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('assently transformDocument', () => {
  it('maps a full raw document to canonical Document', () => {
    const raw: RawAssentlyDocument = {
      id: 'doc-001',
      filename: 'contract.pdf',
      contentType: 'application/pdf',
      size: 102400,
      hash: 'abc123',
      type: 'original',
      order: 0,
      title: 'Main Contract',
      isRequired: true,
    }

    const result = transformDocument(raw, 'case-001', 0)

    // id is envelopeId:docId
    expect(result.id).toBe('case-001:doc-001')
    // externalId is the raw doc id alone
    expect(result.externalId).toBe('doc-001')
    expect(result.envelopeId).toBe('case-001')
    // name prefers filename
    expect(result.name).toBe('contract.pdf')
    expect(result.sizeBytes).toBe(102400)
    expect(result.mimeType).toBe('application/pdf')
    expect(result.order).toBe(0)
    expect(result.platform).toBe('assently')
    expect(result.metadata.type).toBe('original')
    expect(result.metadata.hash).toBe('abc123')
    expect(result.metadata.isRequired).toBe('true')

    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('falls back to title when filename absent, then empty string', () => {
    const r1 = transformDocument({ id: 'd1', title: 'The Title' }, 'case-1', 0)
    expect(r1.name).toBe('The Title')

    const r2 = transformDocument({ id: 'd2' }, 'case-1', 1)
    expect(r2.name).toBe('')
  })

  it('generates synthetic externalId from index when raw.id absent', () => {
    const raw: RawAssentlyDocument = { filename: 'file.pdf' }
    const result = transformDocument(raw, 'case-1', 4)
    expect(result.externalId).toBe('4')
    expect(result.id).toBe('case-1:4')
  })

  it('uses index as order fallback when raw.order absent', () => {
    const raw: RawAssentlyDocument = { id: 'doc-2', filename: 'f.pdf' }
    const result = transformDocument(raw, 'case-1', 3)
    expect(result.order).toBe(3)
  })

  it('accepts string size', () => {
    const raw: RawAssentlyDocument = { id: 'doc-3', filename: 'f.pdf', size: '51200' }
    const result = transformDocument(raw, 'case-1', 0)
    expect(result.sizeBytes).toBe(51200)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})

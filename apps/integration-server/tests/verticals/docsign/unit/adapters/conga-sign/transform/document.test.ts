import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawCongaSignDocument,
} from '../../../../../../../src/verticals/docsign/adapters/conga-sign/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

const RAW: RawCongaSignDocument = {
  id: 'doc-1',
  name: 'contract.pdf',
  index: 0,
  pages: 10,
  size: 204800,
  description: 'Main agreement',
}

describe('conga-sign/transform/document', () => {
  it('maps id → id and externalId', () => {
    const out = transformDocument(RAW, 'env-1', 0)
    expect(out.id).toBe('doc-1')
    expect(out.externalId).toBe('doc-1')
  })

  it('generates fallback id when id absent', () => {
    const out = transformDocument({ name: 'doc.pdf' }, 'env-1', 5)
    expect(out.id).toBe('env-1:5')
  })

  it('maps envelopeId through', () => {
    const out = transformDocument(RAW, 'env-1', 0)
    expect(out.envelopeId).toBe('env-1')
  })

  it('maps name', () => {
    const out = transformDocument(RAW, 'env-1', 0)
    expect(out.name).toBe('contract.pdf')
  })

  it('generates fallback name when absent', () => {
    const out = transformDocument({ id: 'doc-2' }, 'env-1', 2)
    expect(out.name).toBe('document-2')
  })

  it('maps pages (number) → pageCount', () => {
    const out = transformDocument(RAW, 'env-1', 0)
    expect(out.pageCount).toBe(10)
  })

  it('maps pages (array) → pageCount as array length', () => {
    const raw: RawCongaSignDocument = { id: 'doc-3', pages: [{}, {}, {}] }
    const out = transformDocument(raw, 'env-1', 0)
    expect(out.pageCount).toBe(3)
  })

  it('maps size → sizeBytes', () => {
    const out = transformDocument(RAW, 'env-1', 0)
    expect(out.sizeBytes).toBe(204800)
  })

  it('always sets mimeType = application/pdf', () => {
    const out = transformDocument(RAW, 'env-1', 0)
    expect(out.mimeType).toBe('application/pdf')
  })

  it('maps index → order', () => {
    const out = transformDocument(RAW, 'env-1', 7)
    // raw.index is 0 so it takes precedence over fallback 7
    expect(out.order).toBe(0)
  })

  it('falls back order to positional index when index absent', () => {
    const out = transformDocument({ id: 'doc-4', name: 'x.pdf' }, 'env-1', 3)
    expect(out.order).toBe(3)
  })

  it('maps description into metadata', () => {
    const out = transformDocument(RAW, 'env-1', 0)
    expect(out.metadata['description']).toBe('Main agreement')
  })

  it('maps platform = conga-sign', () => {
    const out = transformDocument(RAW, 'env-1', 0)
    expect(out.platform).toBe('conga-sign')
  })

  it('emits a schema-valid Document', () => {
    expect(() => DocumentSchema.parse(transformDocument(RAW, 'env-1', 0))).not.toThrow()
  })
})

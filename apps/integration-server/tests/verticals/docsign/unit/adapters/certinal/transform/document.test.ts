import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/certinal/transform/document'
import type { RawCertinalDocument } from '../../../../../../../src/verticals/docsign/adapters/certinal/transform/envelope'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('certinal/transform/document', () => {
  const RAW: RawCertinalDocument = {
    id: 'doc-1',
    fileName: 'contract.pdf',
    pageCount: 5,
    sequence: 0,
    deletable: false,
    private: false,
  }

  it('maps id → id and externalId', () => {
    const out = transformDocument(RAW, 'env-1')
    expect(out.id).toBe('doc-1')
    expect(out.externalId).toBe('doc-1')
  })

  it('maps envelopeId through', () => {
    const out = transformDocument(RAW, 'env-1')
    expect(out.envelopeId).toBe('env-1')
  })

  it('maps fileName → name', () => {
    const out = transformDocument(RAW, 'env-1')
    expect(out.name).toBe('contract.pdf')
  })

  it('infers mimeType = application/pdf from .pdf suffix', () => {
    const out = transformDocument(RAW, 'env-1')
    expect(out.mimeType).toBe('application/pdf')
  })

  it('leaves mimeType undefined for non-pdf files', () => {
    const out = transformDocument({ id: 'doc-2', fileName: 'attachment.docx' }, 'env-1')
    expect(out.mimeType).toBeUndefined()
  })

  it('maps pageCount', () => {
    const out = transformDocument(RAW, 'env-1')
    expect(out.pageCount).toBe(5)
  })

  it('maps sequence → order', () => {
    const out = transformDocument(RAW, 'env-1')
    expect(out.order).toBe(0)
  })

  it('defaults order to 0 when sequence is absent', () => {
    const out = transformDocument({ id: 'doc-3' }, 'env-1')
    expect(out.order).toBe(0)
  })

  it('maps platform = certinal', () => {
    const out = transformDocument(RAW, 'env-1')
    expect(out.platform).toBe('certinal')
  })

  it('puts deletable and private flags in metadata', () => {
    const out = transformDocument(RAW, 'env-1')
    expect(out.metadata['deletable']).toBe('false')
    expect(out.metadata['private']).toBe('false')
  })

  it('emits a schema-valid Document', () => {
    expect(() => DocumentSchema.parse(transformDocument(RAW, 'env-1'))).not.toThrow()
  })
})

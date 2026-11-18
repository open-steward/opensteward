import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawInsignDocument,
} from '../../../../../../../src/verticals/docsign/adapters/insign/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

const baseDoc: RawInsignDocument = {
  docid: 'insign-doc-1',
  displayname: 'Contract.pdf',
  docname: 'contract.pdf:Contract',
  numberofpages: 8,
  mustbesigned: true,
  hasbeensigned: true,
  hasbeensignedCompletely: true,
  numberOfSignaturesNeeded: 2,
  docposition: 0,
  docchecksum: 'abc123checksum',
}

describe('insign transformDocument', () => {
  it('maps id and externalId from docid', () => {
    const result = transformDocument(baseDoc, 'sess-1', 0)
    expect(result.id).toBe('insign-doc-1')
    expect(result.externalId).toBe('insign-doc-1')
  })

  it('maps envelopeId from sessionId argument', () => {
    const result = transformDocument(baseDoc, 'sess-42', 0)
    expect(result.envelopeId).toBe('sess-42')
  })

  it('maps name from displayname', () => {
    const result = transformDocument(baseDoc, 'sess-1', 0)
    expect(result.name).toBe('Contract.pdf')
  })

  it('falls back to docname (first colon segment) when displayname absent', () => {
    const result = transformDocument({ ...baseDoc, displayname: undefined }, 'sess-1', 0)
    expect(result.name).toBe('contract.pdf')
  })

  it('maps pageCount from numberofpages', () => {
    const result = transformDocument(baseDoc, 'sess-1', 0)
    expect(result.pageCount).toBe(8)
  })

  it('sets mimeType to application/pdf (always)', () => {
    const result = transformDocument(baseDoc, 'sess-1', 0)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('uses docposition as order when present', () => {
    const result = transformDocument({ ...baseDoc, docposition: 3 }, 'sess-1', 99)
    expect(result.order).toBe(3)
  })

  it('falls back to order argument when docposition absent', () => {
    const { docposition, ...noDp } = baseDoc
    const result = transformDocument(noDp, 'sess-1', 5)
    expect(result.order).toBe(5)
  })

  it('sets platform to insign', () => {
    const result = transformDocument(baseDoc, 'sess-1', 0)
    expect(result.platform).toBe('insign')
  })

  it('stores checksum in metadata', () => {
    const result = transformDocument(baseDoc, 'sess-1', 0)
    expect(result.metadata['checksum']).toBe('abc123checksum')
  })

  it('stores mustBeSigned and hasBeenSigned in metadata', () => {
    const result = transformDocument(baseDoc, 'sess-1', 0)
    expect(result.metadata['mustBeSigned']).toBe('true')
    expect(result.metadata['hasBeenSigned']).toBe('true')
  })

  it('falls back to compound id when docid is absent', () => {
    const { docid, ...noId } = baseDoc
    const result = transformDocument(noId, 'sess-1', 2)
    expect(result.id).toBe('sess-1:doc:2')
  })

  it('passes DocumentSchema validation', () => {
    const result = transformDocument(baseDoc, 'sess-1', 0)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('passes DocumentSchema validation for minimal input', () => {
    const result = transformDocument({}, 'sess-1', 0)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})

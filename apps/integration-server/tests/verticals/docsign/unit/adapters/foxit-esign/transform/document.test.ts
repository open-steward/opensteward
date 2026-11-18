import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawFoxitESignDocument,
} from '../../../../../../../src/verticals/docsign/adapters/foxit-esign/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { MYFOLDER_FOLDER } from './fixtures'

const doc = MYFOLDER_FOLDER.documentsList[0] as RawFoxitESignDocument

describe('foxit-esign transformDocument (documentsList of GET /folders/myfolder)', () => {
  it('maps the documented document example onto the canonical schema', () => {
    const out = DocumentSchema.parse(transformDocument(doc, '86377', 0))
    expect(out.id).toBe('86377:101857')
    expect(out.externalId).toBe('101857')
    expect(out.envelopeId).toBe('86377')
    expect(out.name).toBe('Foxit eSign Sample')
    expect(out.order).toBe(0)
    expect(out.sizeBytes).toBeUndefined()
    expect(out.pageCount).toBeUndefined()
    expect(out.mimeType).toBeUndefined()
    expect(out.platform).toBe('foxit-esign')
    expect(out.metadata).toEqual({
      contractType: 'Sample',
      contractStatus: 'EXECUTED',
      contractVersionId: '101715',
      contractVersionNumber: '1',
      contractVersionDesc: 'Foxit eSign Sample Document',
    })
  })

  it('order is the position in documentsList', () => {
    expect(DocumentSchema.parse(transformDocument(doc, 'e', 3)).order).toBe(3)
  })

  it('throws when documentId is missing', () => {
    const { documentId: _d, ...noId } = doc
    expect(() => transformDocument(noId as RawFoxitESignDocument, 'e', 0)).toThrow(/documentId/)
  })

  it('throws when contractVersionName is missing rather than inventing a name', () => {
    expect(() => transformDocument({ ...doc, contractVersionName: null }, 'e', 0)).toThrow(
      /contractVersionName/,
    )
  })
})

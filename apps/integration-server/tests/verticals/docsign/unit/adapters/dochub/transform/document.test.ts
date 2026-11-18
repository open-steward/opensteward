/** Fixture: see ../fixtures.ts (DocHub documented examples). */
import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawDochubDocument,
} from '../../../../../../../src/verticals/docsign/adapters/dochub/transform/document'
import { DOCUMENT } from '../fixtures'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('dochub transformDocument', () => {
  it('maps the documented embedded document', () => {
    const d = DocumentSchema.parse(transformDocument(DOCUMENT, 'sr123abc'))
    expect(d.id).toBe('sr123abc:doc123abc')
    expect(d.externalId).toBe('doc123abc')
    expect(d.envelopeId).toBe('sr123abc')
    expect(d.name).toBe('Contract Agreement')
    expect(d.order).toBe(0)
    expect(d.platform).toBe('dochub')
    // DocHub documents no MIME type, size or page count on this object.
    expect(d.mimeType).toBeUndefined()
    expect(d.sizeBytes).toBeUndefined()
    expect(d.pageCount).toBeUndefined()
    expect(d.metadata).toEqual({ isTemplate: 'false' })
  })

  it('keeps a documented subtitle in metadata', () => {
    const d = DocumentSchema.parse(
      transformDocument({ ...DOCUMENT, subtitle: 'Q1 Contract' }, 'sr'),
    )
    expect(d.metadata.subtitle).toBe('Q1 Contract')
  })

  it('throws rather than inventing a name when title is absent', () => {
    const { title: _t, ...untitled } = DOCUMENT
    expect(() => transformDocument(untitled as RawDochubDocument, 'sr')).toThrow(/title/)
  })
})

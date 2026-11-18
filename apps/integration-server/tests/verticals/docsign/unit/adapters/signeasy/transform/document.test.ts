/**
 * SignEasy document transform over the documented `sources[]` of
 * GET /rs/envelope/{pending_file_id}
 * (https://docs.signeasy.com/reference/fetch-envelope-rs-details.md).
 */
import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/signeasy/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { FETCH_ENVELOPE_EXAMPLE } from '../signeasy.fixture'

describe('signeasy transformDocument', () => {
  it('maps a documented source', () => {
    const out = DocumentSchema.parse(
      transformDocument(FETCH_ENVELOPE_EXAMPLE.sources[1]!, '200000001', 1),
    )
    expect(out.id).toBe('400002')
    expect(out.externalId).toBe('400002')
    expect(out.envelopeId).toBe('200000001')
    expect(out.name).toBe('nda')
    expect(out.order).toBe(1)
    expect(out.metadata).toEqual({ sourceType: 'template' })
    // Nothing in `sources[]` documents a MIME type, size or page count.
    expect(out.mimeType).toBeUndefined()
    expect(out.sizeBytes).toBeUndefined()
    expect(out.pageCount).toBeUndefined()
  })

  it('throws on a source without an id', () => {
    expect(() =>
      transformDocument({ ...FETCH_ENVELOPE_EXAMPLE.sources[0]!, id: undefined }, '1', 0),
    ).toThrow(/id/)
  })

  it('throws on a source without its documented name instead of serving ""', () => {
    expect(() =>
      transformDocument({ ...FETCH_ENVELOPE_EXAMPLE.sources[0]!, name: undefined }, '1', 0),
    ).toThrow(/source name/)
  })
})

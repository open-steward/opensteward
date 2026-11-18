/**
 * Skribble Document -> canonical Document, from the documented example of
 * `GET /v2/documents/{id}` (see ./fixtures.ts) and the "Document (Response)"
 * table (https://api-doc.skribble.com/, Documents / Object details).
 */
import { describe, it, expect } from 'vitest'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/skribble/transform/document'
import { DOCUMENT_EXAMPLE, SIGNATURE_REQUEST_EXAMPLE } from './fixtures'

const ENV = SIGNATURE_REQUEST_EXAMPLE.id

describe('Skribble transformDocument', () => {
  it('maps the documented Document example', () => {
    const out = DocumentSchema.parse(transformDocument(DOCUMENT_EXAMPLE, ENV))
    expect(out.id).toBe(`${ENV}:document`)
    expect(out.externalId).toBe(DOCUMENT_EXAMPLE.id)
    expect(out.envelopeId).toBe(ENV)
    expect(out.name).toBe('First example contract')
    expect(out.sizeBytes).toBe(29094)
    expect(out.pageCount).toBe(1)
    expect(out.mimeType).toBe('application/pdf')
    expect(out.order).toBe(0)
    expect(out.platform).toBe('skribble')
    expect(out.metadata).toEqual({})
  })

  it('does not invent a content type the response did not carry', () => {
    const { content_type: _omit, ...rest } = DOCUMENT_EXAMPLE
    const out = DocumentSchema.parse(transformDocument(rest, ENV))
    expect(out.mimeType).toBeUndefined()
  })

  it('throws rather than inventing a name when the documented title is missing', () => {
    const { title: _omit, ...rest } = DOCUMENT_EXAMPLE
    expect(() => transformDocument(rest, ENV)).toThrow(/title/)
  })

  it('throws rather than inventing an id when the documented id is missing', () => {
    const { id: _omit, ...rest } = DOCUMENT_EXAMPLE
    expect(() => transformDocument(rest, ENV)).toThrow(/id/)
  })
})

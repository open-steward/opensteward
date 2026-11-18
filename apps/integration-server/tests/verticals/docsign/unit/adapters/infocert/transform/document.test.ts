/**
 * GoSign5 `Document` (inside `Dossier.documents`) → canonical Document.
 * `Document` requires mimeType, originalFilename, title and externalId in the
 * GoSign5 OpenAPI (https://devportal.infocert.digital/gosign/documentation/GoSign5).
 */
import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/infocert/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { DOSSIER_EXAMPLE } from '../dossier.fixture'

const DOC = DOSSIER_EXAMPLE.documents![0]!

describe('infocert transformDocument (GoSign5 Document)', () => {
  it('maps the documented Document fields', () => {
    const out = DocumentSchema.parse(transformDocument(DOC, 'dossier-1', 0))
    expect(out.id).toBe('2wedtgw43aw4et')
    expect(out.externalId).toBe('2wedtgw43aw4et')
    expect(out.envelopeId).toBe('dossier-1')
    expect(out.name).toBe('Example document.pdf')
    expect(out.mimeType).toBe('application/pdf')
    expect(out.pageCount).toBe(5)
    expect(out.sizeBytes).toBeUndefined()
    expect(out.order).toBe(0)
    expect(out.platform).toBe('infocert')
    expect(out.metadata).toEqual({
      title: 'Example document',
      fileStatus: 'ACCEPTED',
      visibilityLevel: 'ALL',
      gosignOrder: '1',
      createdAt: '2017-07-21T17:32:28Z',
    })
  })

  it('passes mimeType through as documented rather than assuming PDF', () => {
    const out = DocumentSchema.parse(
      transformDocument({ ...DOC, mimeType: 'application/xml' }, 'dossier-1', 0),
    )
    expect(out.mimeType).toBe('application/xml')
  })

  it('throws rather than inventing an id when externalId is absent', () => {
    expect(() => transformDocument({ ...DOC, externalId: undefined }, 'dossier-1', 0)).toThrow(
      /externalId/,
    )
  })

  it('throws rather than inventing a name when originalFilename is absent', () => {
    expect(() =>
      transformDocument({ ...DOC, originalFilename: undefined }, 'dossier-1', 0),
    ).toThrow(/originalFilename/)
  })
})

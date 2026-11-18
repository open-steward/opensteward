/**
 * The fixture is one item of `data[]` from "List Agreement Versions"
 * (GET /finalize/v2/agreements/{agreement_id}/agreement_versions) in the
 * LinkSquares OpenAPI (https://linksquares.com/api/openapi). Its documented
 * properties are exactly: id ("The UUID of the agreement version."),
 * file_name (example "LinkSquares_NDA.docx"), status_id, created_at and
 * deleted_at ("Expected to be null if not deleted."). All five are required.
 */
import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawLinksquaresAgreementVersion,
} from '../../../../../../../src/verticals/docsign/adapters/linksquares/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

const AGREEMENT = '894e86b8-2866-494e-bb16-5aa19fce3348'

const raw: RawLinksquaresAgreementVersion = {
  id: '3f0c2a52-8a1d-4b8e-9d57-1c2b8a6f0e11',
  file_name: 'LinkSquares_NDA.docx',
  status_id: '7a1e5c3d-0b44-4f5e-a1a2-9c0d7e6b5a43',
  created_at: '2026-03-02T14:05:00Z',
  deleted_at: null,
}

describe('linksquares transformDocument — an agreement version', () => {
  it('parses as a canonical Document', () => {
    const doc = DocumentSchema.parse(transformDocument(raw, AGREEMENT, 0))
    expect(doc).toMatchObject({
      id: `${AGREEMENT}:${raw.id}`,
      externalId: raw.id,
      envelopeId: AGREEMENT,
      name: 'LinkSquares_NDA.docx',
      order: 0,
      platform: 'linksquares',
    })
  })

  it('addresses the version as "<agreementId>:<versionId>" so getDocument can read it back', () => {
    const doc = DocumentSchema.parse(transformDocument(raw, AGREEMENT, 3))
    expect(doc.id.split(':')).toEqual([AGREEMENT, raw.id])
    expect(doc.order).toBe(3)
  })

  it('fills no field the platform does not document: size, pages and MIME type stay absent', () => {
    const doc = DocumentSchema.parse(transformDocument(raw, AGREEMENT, 0))
    expect(doc.sizeBytes).toBeUndefined()
    expect(doc.pageCount).toBeUndefined()
    expect(doc.mimeType).toBeUndefined()
  })

  it('keeps the documented status and timestamps as metadata, dropping a null deleted_at', () => {
    const doc = DocumentSchema.parse(transformDocument(raw, AGREEMENT, 0))
    expect(doc.metadata).toEqual({
      status_id: raw.status_id,
      created_at: raw.created_at,
    })
    const deleted = DocumentSchema.parse(
      transformDocument({ ...raw, deleted_at: '2026-04-01T00:00:00Z' }, AGREEMENT, 0),
    )
    expect(deleted.metadata['deleted_at']).toBe('2026-04-01T00:00:00Z')
  })

  it('throws rather than invent an id when the documented id is missing', () => {
    const { id: _id, ...rest } = raw
    expect(() =>
      transformDocument(rest as unknown as RawLinksquaresAgreementVersion, AGREEMENT, 0),
    ).toThrow(/id/)
  })

  it('throws rather than invent a name when the documented file_name is missing', () => {
    const { file_name: _name, ...rest } = raw
    expect(() =>
      transformDocument(rest as unknown as RawLinksquaresAgreementVersion, AGREEMENT, 0),
    ).toThrow(/file_name/)
  })
})

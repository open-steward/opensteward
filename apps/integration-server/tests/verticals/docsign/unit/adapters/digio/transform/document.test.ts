import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawDigioDocumentDetails,
} from '../../../../../../../src/verticals/docsign/adapters/digio/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { documentDetails } from '../fixtures'

describe('Digio transformDocument (ExternalDocDetails)', () => {
  it('maps the documented fields and parses as a canonical Document', () => {
    const raw = documentDetails('DID1') as RawDigioDocumentDetails
    const out = DocumentSchema.parse(transformDocument(raw))
    expect(out).toMatchObject({
      id: 'DID1',
      externalId: 'DID1',
      envelopeId: 'DID1',
      name: 'Loan Agreement.pdf',
      pageCount: 4,
      order: 0,
      platform: 'digio',
      metadata: { agreementType: 'outbound', agreementStatus: 'requested' },
    })
    // Neither size nor MIME type is a documented field of ExternalDocDetails.
    expect(out.sizeBytes).toBeUndefined()
    expect(out.mimeType).toBeUndefined()
  })

  it('throws rather than invent a name when file_name is absent', () => {
    const { file_name: _f, ...raw } = documentDetails('DID1')
    expect(() => transformDocument(raw as RawDigioDocumentDetails)).toThrow(/file_name/)
  })

  it('throws rather than invent an id when id is absent', () => {
    const { id: _i, ...raw } = documentDetails('DID1')
    expect(() => transformDocument(raw as unknown as RawDigioDocumentDetails)).toThrow(/id/)
  })
})

import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/namirial/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { ENVELOPE_FILES_EXAMPLE, ENVELOPE_ID } from '../fixtures'

const doc = ENVELOPE_FILES_EXAMPLE.Documents![0]!

describe('Namirial transformDocument (EnvelopeGetFilesDocument)', () => {
  it('maps the documented file fields and leaves undocumented ones unset', () => {
    const out = DocumentSchema.parse(transformDocument(doc, ENVELOPE_ID))
    expect(out).toMatchObject({
      id: `${ENVELOPE_ID}:f2000000-0000-0000-0000-000000000001`,
      externalId: 'f2000000-0000-0000-0000-000000000001',
      envelopeId: ENVELOPE_ID,
      name: 'proposal.pdf',
      pageCount: 12,
      order: 0,
      platform: 'namirial',
    })
    expect(out.mimeType).toBeUndefined()
    expect(out.sizeBytes).toBeUndefined()
    expect(out.metadata).toEqual({ attachmentCount: '0' })
  })

  it('orders by DocumentNumber, which starts with 1', () => {
    expect(transformDocument({ ...doc, DocumentNumber: 3 }, ENVELOPE_ID).order).toBe(2)
  })

  it('throws instead of inventing an id, name or position', () => {
    expect(() => transformDocument({ ...doc, FileId: undefined }, ENVELOPE_ID)).toThrow(
      /without a FileId/,
    )
    expect(() => transformDocument({ ...doc, FileName: undefined }, ENVELOPE_ID)).toThrow(
      /no FileName/,
    )
    expect(() => transformDocument({ ...doc, DocumentNumber: undefined }, ENVELOPE_ID)).toThrow(
      /no DocumentNumber/,
    )
  })
})

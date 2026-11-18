import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/lex-persona/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { document } from '../fixtures'

describe('lex-persona transformDocument (Goodflag Document)', () => {
  it('maps a documented Document to a schema-valid Document', () => {
    const d = DocumentSchema.parse(transformDocument(document(), 7))
    expect(d.id).toBe('doc_1')
    expect(d.externalId).toBe('doc_1')
    expect(d.envelopeId).toBe('wfl_1')
    expect(d.name).toBe('contrat.pdf')
    expect(d.sizeBytes).toBe(248320)
    expect(d.mimeType).toBe('application/pdf')
    // orderIndex wins over the row's position.
    expect(d.order).toBe(2)
    expect(d.metadata).toMatchObject({
      workflowName: 'Contrat de prestation',
      signatureProfileId: 'sip_PAdES',
      attachment: 'false',
    })
    expect(d.platform).toBe('lex-persona')
  })

  it('without orderIndex, orders by position; without signatureProfileId, is an attachment', () => {
    const raw = document()
    delete raw.orderIndex
    delete raw.signatureProfileId
    const d = DocumentSchema.parse(transformDocument(raw, 7))
    expect(d.order).toBe(7)
    expect(d.metadata['attachment']).toBe('true')
  })

  it('throws on a document with no parts instead of inventing a name', () => {
    expect(() => transformDocument(document({ parts: [] }), 0)).toThrow(/no parts/)
  })
})

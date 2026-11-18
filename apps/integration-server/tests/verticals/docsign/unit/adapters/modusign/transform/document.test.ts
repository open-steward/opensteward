import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/modusign/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { documentDetail } from '../fixtures'

describe('modusign transformDocument', () => {
  it('maps GetDocumentResponseDto to a canonical Document sharing the envelope id', () => {
    const out = DocumentSchema.parse(transformDocument(documentDetail()))
    expect(out).toMatchObject({
      id: 'doc_1',
      externalId: 'doc_1',
      envelopeId: 'doc_1',
      name: '근로계약서',
      mimeType: 'application/pdf',
      order: 0,
      platform: 'modusign',
      metadata: { status: 'ON_GOING' },
    })
  })

  it('never carries the file or audit-trail download URLs in raw', () => {
    const out = DocumentSchema.parse(transformDocument(documentDetail()))
    const raw = out.raw as Record<string, unknown>
    expect(raw['file']).toBeUndefined()
    expect(raw['auditTrail']).toBeUndefined()
    expect(JSON.stringify(out)).not.toContain('downloadUrl')
    expect(raw['id']).toBe('doc_1')
  })
})

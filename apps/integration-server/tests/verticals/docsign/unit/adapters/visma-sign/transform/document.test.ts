import { describe, it, expect } from 'vitest'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/visma-sign/transform/document'
import { documentStatus } from '../fixtures'

describe('visma-sign transformDocument', () => {
  it('maps a documented files[] entry onto a valid Document', () => {
    const doc = documentStatus()
    const out = DocumentSchema.parse(transformDocument(doc.files![0]!, doc.uuid, 0))
    expect(out).toEqual({
      id: 'e59c8dc8-8848-4936-ac7c-50d9ed72085a:0',
      externalId: 'e59c8dc8-8848-4936-ac7c-50d9ed72085a:0',
      envelopeId: 'e59c8dc8-8848-4936-ac7c-50d9ed72085a',
      name: '0959d490-253c-4910-a818-e0f00e4abc97.pdf',
      mimeType: 'application/pdf',
      order: 0,
      platform: 'visma-sign',
      metadata: {},
      raw: { filename: '0959d490-253c-4910-a818-e0f00e4abc97.pdf' },
    })
  })

  it('throws rather than invent a name for a file without one', () => {
    expect(() => transformDocument({}, 'doc', 0)).toThrow(/no filename/)
  })
})

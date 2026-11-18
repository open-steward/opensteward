import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/webdox/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { workflowInfoExample } from '../fixtures'

describe('webdox transformDocument', () => {
  it('maps a documented Workflow Info document to a canonical Document', () => {
    const raw = workflowInfoExample().documents[0]!
    const result = DocumentSchema.parse(transformDocument(raw, '78', 0))

    expect(result.id).toBe('721111e8ba7847589648e0d2e4efe058')
    expect(result.externalId).toBe('721111e8ba7847589648e0d2e4efe058')
    expect(result.envelopeId).toBe('78')
    expect(result.name).toBe('My-Documnet.pdf')
    expect(result.order).toBe(0)
    expect(result.platform).toBe('webdox')
    // Workflow Info carries no size or file type; none is invented.
    expect(result.sizeBytes).toBeUndefined()
    expect(result.mimeType).toBeUndefined()
    expect(result.metadata).toEqual({
      type: 'document',
      inRepository: 'true',
      signable: 'true',
      signed: 'false',
      createdAt: '2023-05-15T15:53:35.768-04:00',
    })
  })

  it('throws on a document with no name rather than emitting an empty string', () => {
    const raw = { ...workflowInfoExample().documents[0]!, name: null }
    expect(() => transformDocument(raw, '78', 0)).toThrow(/has no name/)
  })

  it('keeps its position within the workflow as order', () => {
    const raw = workflowInfoExample().documents[0]!
    expect(DocumentSchema.parse(transformDocument(raw, '78', 3)).order).toBe(3)
  })
})

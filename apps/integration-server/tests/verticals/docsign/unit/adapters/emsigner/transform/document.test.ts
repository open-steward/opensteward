import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/emsigner/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { WORKFLOW_INFO_EXAMPLE } from './fixtures'

const [FIRST] = WORKFLOW_INFO_EXAMPLE.DocumentInfo!

describe('emsigner transformDocument', () => {
  it('maps a GetWorkflowInfo DocumentInfo onto a valid Document', () => {
    const out = DocumentSchema.parse(transformDocument(FIRST!, '1', 0))
    expect(out.id).toBe('3')
    expect(out.externalId).toBe('3')
    expect(out.envelopeId).toBe('1')
    expect(out.name).toBe('sample string 2')
    expect(out.order).toBe(0)
    expect(out.sizeBytes).toBeUndefined()
    expect(out.mimeType).toBeUndefined()
    expect(out.metadata['documentSize']).toBe('sample string 5')
    expect(out.metadata['templateId']).toBe('1')
  })

  it('throws without a DocumentId', () => {
    expect(() => transformDocument({ ...FIRST!, DocumentId: undefined }, '1', 0)).toThrow(
      /DocumentId/,
    )
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawConcordAttachment,
} from '../../../../../../../src/verticals/docsign/adapters/concord/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { ATTACHMENT_EXAMPLE } from './fixtures'

const attachment = ATTACHMENT_EXAMPLE as RawConcordAttachment

describe('concord transformDocument', () => {
  it('maps an Attachment onto the canonical schema', () => {
    const out = DocumentSchema.parse(transformDocument(attachment, 'agr-1', 2))
    expect(out.id).toBe('att-1')
    expect(out.externalId).toBe('att-1')
    expect(out.envelopeId).toBe('agr-1')
    expect(out.name).toBe('annex-a.pdf')
    expect(out.order).toBe(2)
    expect(out.sizeBytes).toBeUndefined()
    expect(out.pageCount).toBeUndefined()
    expect(out.mimeType).toBeUndefined()
    expect(out.metadata).toEqual({
      title: 'Annex A',
      description: 'Pricing annex',
      createdAt: '2026-01-15T09:30:00.000Z',
    })
  })

  it('drops the file url and data from raw', () => {
    const raw = transformDocument(attachment, 'agr-1', 0).raw as Record<string, unknown>
    expect(raw).not.toHaveProperty('url')
    expect(raw).not.toHaveProperty('data')
    expect(raw['fileName']).toBe('annex-a.pdf')
  })

  it('throws instead of inventing a file name', () => {
    expect(() => transformDocument({ ...attachment, fileName: '' }, 'agr-1', 0)).toThrow(/fileName/)
  })
})

import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/legalesign/transform/document'
import type { RawLegalesignDocument } from '../../../../../../../src/verticals/docsign/adapters/legalesign/transform/envelope'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('legalesign transformDocument', () => {
  const raw: RawLegalesignDocument = {
    uuid: 'doc-uuid-001',
    name: 'Employment Contract.pdf',
    hash_value: 'abc123sha256',
    group: '/api/v1/group/grp-77/',
    created: '2025-05-01T09:00:00.000Z',
    modified: '2025-05-05T11:00:00.000Z',
  }

  it('maps uuid to id and externalId', () => {
    const result = transformDocument(raw)
    expect(result.id).toBe('doc-uuid-001')
    expect(result.externalId).toBe('doc-uuid-001')
  })

  it('uses uuid as envelopeId (single PDF per document)', () => {
    const result = transformDocument(raw)
    expect(result.envelopeId).toBe('doc-uuid-001')
  })

  it('maps name to name field', () => {
    const result = transformDocument(raw)
    expect(result.name).toBe('Employment Contract.pdf')
  })

  it('hardcodes mimeType to application/pdf', () => {
    const result = transformDocument(raw)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('sets order to 0 (single document per envelope)', () => {
    const result = transformDocument(raw)
    expect(result.order).toBe(0)
  })

  it('sets platform to legalesign', () => {
    const result = transformDocument(raw)
    expect(result.platform).toBe('legalesign')
  })

  it('falls back to uuid.pdf when name is absent', () => {
    const { name: _, ...rest } = raw
    const result = transformDocument(rest as RawLegalesignDocument)
    expect(result.name).toBe('doc-uuid-001.pdf')
  })

  it('passes DocumentSchema validation', () => {
    const result = transformDocument(raw)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})

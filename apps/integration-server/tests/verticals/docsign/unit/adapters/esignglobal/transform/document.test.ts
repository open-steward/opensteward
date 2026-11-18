import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/esignglobal/transform/document'
import type { RawEsignglobalFile } from '../../../../../../../src/verticals/docsign/adapters/esignglobal/transform/envelope'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('esignglobal transformDocument', () => {
  it('maps a signFile with fileKey and fileName', () => {
    const raw: RawEsignglobalFile = { fileKey: 'fk-123', fileName: 'contract.pdf' }
    const result = transformDocument(raw, 'env-001', 0, 'signFile')

    // id = envelopeId:fileKey
    expect(result.id).toBe('env-001:fk-123')
    expect(result.externalId).toBe('env-001:fk-123')
    expect(result.envelopeId).toBe('env-001')
    expect(result.name).toBe('contract.pdf')
    expect(result.order).toBe(0)
    expect(result.platform).toBe('esignglobal')
    // kind tracked in metadata
    expect(result.metadata['kind']).toBe('signFile')
    expect(result.metadata['fileKey']).toBe('fk-123')

    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('maps an attachment with default order', () => {
    const raw: RawEsignglobalFile = { fileKey: 'att-456', fileName: 'attachment.pdf' }
    const result = transformDocument(raw, 'env-002', 1, 'attachment')

    expect(result.id).toBe('env-002:att-456')
    expect(result.order).toBe(1)
    expect(result.metadata['kind']).toBe('attachment')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('falls back to order-index when fileKey is missing', () => {
    const raw: RawEsignglobalFile = { fileName: 'mystery.pdf' }
    const result = transformDocument(raw, 'env-003', 2)

    // fileKey fallback = String(order) = "2"
    expect(result.id).toBe('env-003:2')
    expect(result.name).toBe('mystery.pdf')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('uses fallback name when fileName is absent', () => {
    const raw: RawEsignglobalFile = { fileKey: 'fk-no-name' }
    const result = transformDocument(raw, 'env-004', 3)

    expect(result.name).toBe('document-3')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('does not expose content or url fields', () => {
    const raw: RawEsignglobalFile = { fileKey: 'fk-x', fileName: 'test.pdf' }
    const result = transformDocument(raw, 'env-005', 0)

    expect((result as Record<string, unknown>)['content']).toBeUndefined()
    expect((result as Record<string, unknown>)['url']).toBeUndefined()
  })
})

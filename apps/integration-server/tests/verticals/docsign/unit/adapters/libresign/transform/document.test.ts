import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/libresign/transform/document'
import type { RawLibreSignFile } from '../../../../../../../src/verticals/docsign/adapters/libresign/transform/envelope'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('libresign transformDocument', () => {
  const raw: RawLibreSignFile = {
    uuid: 'file-uuid-002',
    name: 'Lease Agreement.pdf',
    size: 512000,
    totalPages: 8,
    mime: 'application/pdf',
    nodeId: 42,
    pdfVersion: '1.7',
  }

  it('maps envelopeId to id and externalId', () => {
    const result = transformDocument(raw, 'file-uuid-002')
    expect(result.id).toBe('file-uuid-002')
    expect(result.externalId).toBe('file-uuid-002')
  })

  it('sets envelopeId to the passed envelopeId', () => {
    const result = transformDocument(raw, 'file-uuid-002')
    expect(result.envelopeId).toBe('file-uuid-002')
  })

  it('maps name to name', () => {
    const result = transformDocument(raw, 'file-uuid-002')
    expect(result.name).toBe('Lease Agreement.pdf')
  })

  it('maps size to sizeBytes', () => {
    const result = transformDocument(raw, 'file-uuid-002')
    expect(result.sizeBytes).toBe(512000)
  })

  it('maps totalPages to pageCount', () => {
    const result = transformDocument(raw, 'file-uuid-002')
    expect(result.pageCount).toBe(8)
  })

  it('maps mime to mimeType', () => {
    const result = transformDocument(raw, 'file-uuid-002')
    expect(result.mimeType).toBe('application/pdf')
  })

  it('sets order to 0', () => {
    const result = transformDocument(raw, 'file-uuid-002')
    expect(result.order).toBe(0)
  })

  it('sets platform to libresign', () => {
    const result = transformDocument(raw, 'file-uuid-002')
    expect(result.platform).toBe('libresign')
  })

  it('falls back to application/pdf when mime is absent', () => {
    const { mime: _, ...rest } = raw
    const result = transformDocument(rest as RawLibreSignFile, 'file-uuid-002')
    expect(result.mimeType).toBe('application/pdf')
  })

  it('passes DocumentSchema validation', () => {
    const result = transformDocument(raw, 'file-uuid-002')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawIcertisAssociatedDocument,
} from '../../../../../../../src/verticals/docsign/adapters/icertis/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

const baseDoc: RawIcertisAssociatedDocument = {
  ICMId: 'doc-001',
  FileName: 'contract.pdf',
  FileSize: 204800,
  PageCount: 12,
  MimeType: 'application/pdf',
}

describe('icertis transformDocument', () => {
  it('maps id and externalId from ICMId', () => {
    const result = transformDocument(baseDoc, 'env-1', 0)
    expect(result.id).toBe('doc-001')
    expect(result.externalId).toBe('doc-001')
  })

  it('maps envelopeId from second argument', () => {
    const result = transformDocument(baseDoc, 'env-42', 0)
    expect(result.envelopeId).toBe('env-42')
  })

  it('maps name from FileName', () => {
    const result = transformDocument(baseDoc, 'env-1', 0)
    expect(result.name).toBe('contract.pdf')
  })

  it('maps sizeBytes from FileSize', () => {
    const result = transformDocument(baseDoc, 'env-1', 0)
    expect(result.sizeBytes).toBe(204800)
  })

  it('maps pageCount from PageCount', () => {
    const result = transformDocument(baseDoc, 'env-1', 0)
    expect(result.pageCount).toBe(12)
  })

  it('maps mimeType from MimeType', () => {
    const result = transformDocument(baseDoc, 'env-1', 0)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('defaults mimeType to application/pdf when absent', () => {
    const result = transformDocument({ ICMId: 'doc-002' }, 'env-1', 0)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('maps order from third argument', () => {
    const result = transformDocument(baseDoc, 'env-1', 3)
    expect(result.order).toBe(3)
  })

  it('sets platform to icertis', () => {
    const result = transformDocument(baseDoc, 'env-1', 0)
    expect(result.platform).toBe('icertis')
  })

  it('falls back to compound id when ICMId and Id are missing', () => {
    const result = transformDocument({}, 'env-1', 2)
    expect(result.id).toBe('env-1:2')
  })

  it('prefers ICMId over Id', () => {
    const result = transformDocument({ ICMId: 'icm-1', Id: 'id-1' }, 'env-1', 0)
    expect(result.id).toBe('icm-1')
  })

  it('falls back to Name when FileName absent', () => {
    const result = transformDocument({ ICMId: 'doc-1', Name: 'agreement.pdf' }, 'env-1', 0)
    expect(result.name).toBe('agreement.pdf')
  })

  it('passes DocumentSchema validation', () => {
    const result = transformDocument(baseDoc, 'env-1', 0)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})

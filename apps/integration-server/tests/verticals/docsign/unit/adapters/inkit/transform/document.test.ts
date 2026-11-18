import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawInkitDocument,
} from '../../../../../../../src/verticals/docsign/adapters/inkit/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

const baseDoc: RawInkitDocument = {
  id: 'doc-ink-001',
  name: 'Invoice.pdf',
  status: 'completed',
  template_id: 'tmpl-42',
  page_count: 3,
  size_bytes: 81920,
  render_id: 'render-9',
  folder_id: 'folder-1',
  created_by: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' },
  created_at: '2025-03-01T00:00:00.000Z',
  modified_at: '2025-03-02T00:00:00.000Z',
  expire_at: '2026-03-01T00:00:00.000Z',
  expire_after_n_views: 5,
}

describe('inkit transformDocument', () => {
  it('maps id and externalId from raw.id', () => {
    const result = transformDocument(baseDoc, 'env-1', 0)
    expect(result.id).toBe('doc-ink-001')
    expect(result.externalId).toBe('doc-ink-001')
  })

  it('maps envelopeId from second argument', () => {
    const result = transformDocument(baseDoc, 'env-99', 0)
    expect(result.envelopeId).toBe('env-99')
  })

  it('maps name from raw.name', () => {
    const result = transformDocument(baseDoc, 'env-1', 0)
    expect(result.name).toBe('Invoice.pdf')
  })

  it('maps sizeBytes from size_bytes', () => {
    const result = transformDocument(baseDoc, 'env-1', 0)
    expect(result.sizeBytes).toBe(81920)
  })

  it('maps pageCount from page_count', () => {
    const result = transformDocument(baseDoc, 'env-1', 0)
    expect(result.pageCount).toBe(3)
  })

  it('sets mimeType to application/pdf (always)', () => {
    const result = transformDocument(baseDoc, 'env-1', 0)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('maps order from third argument', () => {
    const result = transformDocument(baseDoc, 'env-1', 7)
    expect(result.order).toBe(7)
  })

  it('sets platform to inkit', () => {
    const result = transformDocument(baseDoc, 'env-1', 0)
    expect(result.platform).toBe('inkit')
  })

  it('stores status and templateId in metadata', () => {
    const result = transformDocument(baseDoc, 'env-1', 0)
    expect(result.metadata['status']).toBe('completed')
    expect(result.metadata['templateId']).toBe('tmpl-42')
  })

  it('stores renderId and folderId in metadata', () => {
    const result = transformDocument(baseDoc, 'env-1', 0)
    expect(result.metadata['renderId']).toBe('render-9')
    expect(result.metadata['folderId']).toBe('folder-1')
  })

  it('stores createdBy name in metadata', () => {
    const result = transformDocument(baseDoc, 'env-1', 0)
    expect(result.metadata['createdBy']).toBe('Ada Lovelace')
  })

  it('falls back to compound id when raw.id is absent', () => {
    const { id, ...noId } = baseDoc
    const result = transformDocument(noId, 'env-1', 4)
    expect(result.id).toBe('env-1:4')
  })

  it('defaults name to document-{order} when name absent', () => {
    const result = transformDocument({}, 'env-1', 2)
    expect(result.name).toBe('document-2')
  })

  it('passes DocumentSchema validation', () => {
    const result = transformDocument(baseDoc, 'env-1', 0)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('passes DocumentSchema validation for minimal input', () => {
    const result = transformDocument({}, 'env-1', 0)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})

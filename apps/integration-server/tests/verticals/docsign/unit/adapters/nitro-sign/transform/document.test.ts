/**
 * Nitro Sign document → canonical Document (metadata only).
 *
 * Schemas: `PendingDocumentResponse` / `UploadedDocumentResponse` /
 * `FailedDocumentResponse` / `SignedDocumentResponse` /
 * `SealedDocumentResponse` in https://api.gonitro.dev/openapi.json, all with
 * `required: [ID, name]` and optional `createdAt`, `status`, `sizeBytes`,
 * `numPages` (and `failureReason` on Failed).
 */
import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/nitro-sign/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { LIST_DOCUMENTS_EXAMPLE, UPLOADED_DOCUMENT } from '../fixtures'

const ENV = '6e60b9f4-e7dd-4daf-af64-5ab274a8e1fd'

describe('nitro-sign transformDocument', () => {
  it('maps the documented list example verbatim and parses with DocumentSchema', () => {
    const d = DocumentSchema.parse(transformDocument(LIST_DOCUMENTS_EXAMPLE.items[0]!, ENV, 0))
    expect(d.id).toBe(`${ENV}:987e6543-e21b-12d3-a456-426614174999`)
    expect(d.externalId).toBe('987e6543-e21b-12d3-a456-426614174999')
    expect(d.envelopeId).toBe(ENV)
    expect(d.name).toBe('Document')
    expect(d.order).toBe(0)
    expect(d.sizeBytes).toBeUndefined()
    expect(d.pageCount).toBeUndefined()
    expect(d.mimeType).toBeUndefined()
    expect(d.metadata).toEqual({ createdAt: '2023-11-07T05:31:56Z' })
  })

  it('maps sizeBytes, numPages and status from an uploaded document', () => {
    const d = DocumentSchema.parse(transformDocument(UPLOADED_DOCUMENT, ENV, 3))
    expect(d.sizeBytes).toBe(248320)
    expect(d.pageCount).toBe(12)
    expect(d.order).toBe(3)
    expect(d.metadata['status']).toBe('uploaded')
    expect(d.platform).toBe('nitro-sign')
  })

  it('carries a failed document failureReason into metadata', () => {
    const d = DocumentSchema.parse(
      transformDocument(
        { ...UPLOADED_DOCUMENT, status: 'failed', failureReason: 'corrupt' },
        ENV,
        0,
      ),
    )
    expect(d.metadata['failureReason']).toBe('corrupt')
  })

  it('throws on a document with no ID or no name (both required by the spec)', () => {
    const { ID: _id, ...noId } = UPLOADED_DOCUMENT
    const { name: _n, ...noName } = UPLOADED_DOCUMENT
    expect(() => transformDocument(noId, ENV, 0)).toThrow(/ID/)
    expect(() => transformDocument(noName, ENV, 0)).toThrow(/name/)
  })
})

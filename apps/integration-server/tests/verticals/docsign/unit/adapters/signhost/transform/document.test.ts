/**
 * Signhost Files entry -> canonical Document, from the documented example
 * (see ./fixtures.ts) and the FileEntry model
 * (https://developer.signhost.com/openapi/models/FileEntry.md).
 */
import { describe, it, expect } from 'vitest'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/signhost/transform/document'
import { TRANSACTION_EXAMPLE } from './fixtures'

const ENV = TRANSACTION_EXAMPLE.Id
const ENTRY = TRANSACTION_EXAMPLE.Files['contract.pdf']

describe('Signhost transformDocument', () => {
  it('maps the documented example file entry', () => {
    const out = DocumentSchema.parse(transformDocument('contract.pdf', ENTRY, ENV, 0))
    expect(out.id).toBe(`${ENV}:contract.pdf`)
    expect(out.externalId).toBe('contract.pdf')
    expect(out.envelopeId).toBe(ENV)
    expect(out.name).toBe('contract.pdf')
    // Link.Type: "MIME type or content type of the linked resource"
    expect(out.mimeType).toBe('application/pdf')
    expect(out.order).toBe(0)
    expect(out.sizeBytes).toBeUndefined()
    expect(out.pageCount).toBeUndefined()
    expect(out.platform).toBe('signhost')
  })

  it('names the file by its DisplayName, not its id', () => {
    const out = transformDocument('f1', { ...ENTRY, DisplayName: 'Contract.pdf' }, ENV, 3)
    expect(out.name).toBe('Contract.pdf')
    expect(out.externalId).toBe('f1')
    expect(out.order).toBe(3)
  })

  it('throws on an entry without the documented DisplayName', () => {
    expect(() => transformDocument('f1', { Links: ENTRY.Links }, ENV, 0)).toThrow(/DisplayName/)
  })

  it('leaves mimeType unset when no file link carries a Type', () => {
    const out = transformDocument('f1', { DisplayName: 'a.pdf', Links: [] }, ENV, 0)
    expect(DocumentSchema.parse(out).mimeType).toBeUndefined()
  })
})

describe('Signhost transformDocument (review follow-ups)', () => {
  it('takes mimeType only from the link whose Rel is "file"', () => {
    const out = transformDocument(
      'f1',
      { DisplayName: 'a.pdf', Links: [{ Rel: 'receipt', Type: 'text/html', Link: 'x' }] },
      ENV,
      0,
    )
    expect(DocumentSchema.parse(out).mimeType).toBeUndefined()
  })

  it('carries no download link in raw', () => {
    const out = DocumentSchema.parse(transformDocument('contract.pdf', ENTRY, ENV, 0))
    expect(out.raw).not.toHaveProperty('Links')
    expect(JSON.stringify(out.raw)).not.toContain('https://')
    expect(out.raw).toEqual({ fileId: 'contract.pdf', DisplayName: 'contract.pdf' })
  })
})

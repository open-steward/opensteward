import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/blueink/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('blueink transformDocument', () => {
  const rawPdf = {
    key: 'doc_key_1',
    filename: 'contract.pdf',
    file_url: 'https://blueink.example/files/contract.pdf',
    template_id: 'tmpl_abc',
  }

  const rawNonPdf = {
    key: 'doc_key_2',
    filename: 'exhibit.docx',
  }

  it('maps id as envelopeId:order composite', () => {
    const result = transformDocument(rawPdf, 'bnd_abc123', 0)
    expect(result.id).toBe('bnd_abc123:0')
  })

  it('maps externalId to raw key', () => {
    const result = transformDocument(rawPdf, 'bnd_abc123', 0)
    expect(result.externalId).toBe('doc_key_1')
  })

  it('maps envelopeId from parameter', () => {
    const result = transformDocument(rawPdf, 'bnd_abc123', 0)
    expect(result.envelopeId).toBe('bnd_abc123')
  })

  it('maps name from filename', () => {
    const result = transformDocument(rawPdf, 'bnd_abc123', 0)
    expect(result.name).toBe('contract.pdf')
  })

  it('falls back to key when filename is absent', () => {
    const result = transformDocument({ key: 'doc_key_2' }, 'bnd_abc123', 0)
    expect(result.name).toBe('doc_key_2')
  })

  it('sets mimeType to application/pdf for .pdf files', () => {
    const result = transformDocument(rawPdf, 'bnd_abc123', 0)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('leaves mimeType undefined for non-.pdf files', () => {
    const result = transformDocument(rawNonPdf, 'bnd_abc123', 1)
    expect(result.mimeType).toBeUndefined()
  })

  it('maps order from parameter', () => {
    const result = transformDocument(rawPdf, 'bnd_abc123', 3)
    expect(result.order).toBe(3)
  })

  it('sets platform to blueink', () => {
    const result = transformDocument(rawPdf, 'bnd_abc123', 0)
    expect(result.platform).toBe('blueink')
  })

  it('includes key and templateId in metadata', () => {
    const result = transformDocument(rawPdf, 'bnd_abc123', 0)
    expect(result.metadata.key).toBe('doc_key_1')
    expect(result.metadata.templateId).toBe('tmpl_abc')
  })

  it('uses envelopeId:order as externalId when key is absent', () => {
    const result = transformDocument({ filename: 'plain.pdf' }, 'bnd_xyz', 2)
    expect(result.externalId).toBe('bnd_xyz:2')
  })

  it('passes DocumentSchema.parse without throwing', () => {
    const result = transformDocument(rawPdf, 'bnd_abc123', 0)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})

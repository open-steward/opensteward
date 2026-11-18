import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawDocusealDocument,
} from '../../../../../../../src/verticals/docsign/adapters/docuseal/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('docuseal transformDocument', () => {
  it('maps a PDF document (detected by filename extension)', () => {
    const raw: RawDocusealDocument = {
      name: 'employment_contract.pdf',
      url: 'https://example.com/docs/employment_contract.pdf',
    }
    const result = transformDocument(raw, 101, 0)

    expect(result.id).toBe('101:0')
    expect(result.externalId).toBe('101:0')
    expect(result.envelopeId).toBe('101')
    expect(result.name).toBe('employment_contract.pdf')
    expect(result.mimeType).toBe('application/pdf')
    expect(result.order).toBe(0)
    expect(result.platform).toBe('docuseal')
    // url should never be surfaced (content refused by schema)
    expect((result as Record<string, unknown>)['url']).toBeUndefined()

    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('does not set mimeType for non-pdf extension', () => {
    const raw: RawDocusealDocument = {
      name: 'agreement.docx',
      url: 'https://example.com/docs/agreement.docx',
    }
    const result = transformDocument(raw, 200, 1)

    expect(result.mimeType).toBeUndefined()
    expect(result.order).toBe(1)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('falls back to synthetic name when name absent', () => {
    const raw: RawDocusealDocument = {}
    const result = transformDocument(raw, 300, 2)

    expect(result.name).toBe('document-2')
    expect(result.mimeType).toBeUndefined()
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('never exposes url in output', () => {
    const raw: RawDocusealDocument = {
      name: 'invoice.pdf',
      url: 'https://secret.example.com/invoice.pdf',
    }
    const result = transformDocument(raw, 400, 0)

    // url field is absent from raw output stored in result.raw
    const raw_output = result.raw as Record<string, unknown>
    expect(raw_output['url']).toBeUndefined()
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })

  it('uses string submissionId', () => {
    const raw: RawDocusealDocument = { name: 'doc.pdf' }
    const result = transformDocument(raw, '999', 3)

    expect(result.id).toBe('999:3')
    expect(result.envelopeId).toBe('999')
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})

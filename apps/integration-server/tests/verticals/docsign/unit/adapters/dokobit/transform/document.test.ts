import { describe, it, expect } from 'vitest'
import {
  transformDocument,
  type RawDokobitFile,
} from '../../../../../../../src/verticals/docsign/adapters/dokobit/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { SIGNING_STATUS_EXAMPLE } from './fixtures'

const file = SIGNING_STATUS_EXAMPLE.files[0] as RawDokobitFile

describe('dokobit transformDocument', () => {
  it('maps the documented status.json file onto the canonical schema', () => {
    const out = DocumentSchema.parse(transformDocument(file, 'env-1', 0))
    expect(out.id).toBe('env-1:0')
    expect(out.externalId).toBe('env-1:0')
    expect(out.envelopeId).toBe('env-1')
    expect(out.name).toBe('labadienaVTnqOstest.pdf')
    expect(out.mimeType).toBe('application/pdf')
    expect(out.order).toBe(0)
    expect(out.sizeBytes).toBeUndefined()
    expect(out.pageCount).toBeUndefined()
    expect(out.platform).toBe('dokobit')
  })

  it('keeps the file download URL out of the output', () => {
    expect(JSON.stringify(transformDocument(file, 'env-1', 0))).not.toContain('/download')
  })

  it('throws when the required file name is absent', () => {
    expect(() => transformDocument({ mime_type: 'application/pdf' }, 'e', 0)).toThrow(/name/)
  })

  it('carries the documented file type (main, appendix, attachment) into metadata', () => {
    const out = DocumentSchema.parse(transformDocument({ ...file, type: 'appendix' }, 'e', 0))
    expect(out.metadata).toEqual({ type: 'appendix' })
  })
})

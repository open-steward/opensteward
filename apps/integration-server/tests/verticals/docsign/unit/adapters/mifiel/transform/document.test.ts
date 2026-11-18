import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/mifiel/transform/document'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { QUERY_RECORD_EXAMPLE } from './fixtures'

describe('mifiel transformDocument', () => {
  it('maps the documented query record (one Mifiel document = one file) onto the canonical schema', () => {
    const out = DocumentSchema.parse(transformDocument(QUERY_RECORD_EXAMPLE))
    expect(out.id).toBe('32214f64-f695-4691-8f6c-073681b05543')
    expect(out.externalId).toBe('32214f64-f695-4691-8f6c-073681b05543')
    expect(out.envelopeId).toBe('32214f64-f695-4691-8f6c-073681b05543')
    expect(out.name).toBe('demo.pdf')
    expect(out.order).toBe(0)
    expect(out.mimeType).toBeUndefined()
    expect(out.sizeBytes).toBeUndefined()
    expect(out.pageCount).toBeUndefined()
    expect(out.platform).toBe('mifiel')
  })

  it('a record without an id or file name is an error, not a placeholder', () => {
    expect(() => transformDocument({ ...QUERY_RECORD_EXAMPLE, id: '' })).toThrow(/no id/)
    expect(() => transformDocument({ ...QUERY_RECORD_EXAMPLE, file_file_name: '' })).toThrow(
      /file_file_name/,
    )
  })
})

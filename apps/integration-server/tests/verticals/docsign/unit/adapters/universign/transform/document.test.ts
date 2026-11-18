import { describe, it, expect } from 'vitest'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/universign/transform/document'
import type { RawUniversignTransaction } from '../../../../../../../src/verticals/docsign/adapters/universign/transform/types'
import { START_TRANSACTION } from '../fixtures'

describe('universign transformDocument (documented documents[ ])', () => {
  it('maps the "Start a transaction" document and survives DocumentSchema', () => {
    const t = START_TRANSACTION as unknown as RawUniversignTransaction
    const out = DocumentSchema.parse(transformDocument(t.documents![0]!, t.id, 0))
    expect(out.id).toBe('tx_YLyDVeWbgW0z:doc_Bdk')
    expect(out.externalId).toBe('doc_Bdk')
    expect(out.envelopeId).toBe('tx_YLyDVeWbgW0z')
    expect(out.name).toBe('DocName')
    expect(out.order).toBe(0)
    // Universign documents no size, page count or MIME type.
    expect(out.sizeBytes).toBeUndefined()
    expect(out.pageCount).toBeUndefined()
    expect(out.mimeType).toBeUndefined()
  })
})

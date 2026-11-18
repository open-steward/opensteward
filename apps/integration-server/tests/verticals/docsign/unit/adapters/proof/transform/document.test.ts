import { describe, it, expect } from 'vitest'
import { transformDocument } from '../../../../../../../src/verticals/docsign/adapters/proof/transform/document'
import type { RawProofDocument } from '../../../../../../../src/verticals/docsign/adapters/proof/transform/envelope'
import { DocumentSchema } from '../../../../../../../src/verticals/docsign/schema/document'

describe('proof transformDocument', () => {
  const raw: RawProofDocument = {
    id: 'doc_001',
    document_name: 'Closing Disclosure.pdf',
    requirement: 'esign',
    esign_required: true,
    notarization_required: false,
    identity_confirmation_required: false,
    date_created: '2026-01-10T08:00:00.000Z',
    date_updated: '2026-01-15T12:00:00.000Z',
    completion_state: 'complete',
    processing_state: 'processed',
    bundle_position: 0,
    is_enote: false,
    vaulted: false,
  }

  const transactionId = 'txn_001'
  const index = 0

  it('constructs id as transactionId:externalId', () => {
    const result = transformDocument(raw, transactionId, index)
    expect(result.id).toBe('txn_001:doc_001')
    expect(result.externalId).toBe('doc_001')
  })

  it('maps name from document_name', () => {
    const result = transformDocument(raw, transactionId, index)
    expect(result.name).toBe('Closing Disclosure.pdf')
  })

  it('always sets mimeType to application/pdf', () => {
    const result = transformDocument(raw, transactionId, index)
    expect(result.mimeType).toBe('application/pdf')
  })

  it('maps order from bundle_position', () => {
    const result = transformDocument(raw, transactionId, index)
    expect(result.order).toBe(0)
  })

  it('falls back to index for order when bundle_position is absent', () => {
    const result = transformDocument({ ...raw, bundle_position: undefined }, transactionId, 3)
    expect(result.order).toBe(3)
  })

  it('sets envelopeId to transactionId', () => {
    const result = transformDocument(raw, transactionId, index)
    expect(result.envelopeId).toBe('txn_001')
  })

  it('sets platform to proof', () => {
    const result = transformDocument(raw, transactionId, index)
    expect(result.platform).toBe('proof')
  })

  it('includes requirement and completionState in metadata', () => {
    const result = transformDocument(raw, transactionId, index)
    expect(result.metadata.requirement).toBe('esign')
    expect(result.metadata.completionState).toBe('complete')
  })

  it('includes boolean esignRequired stringified in metadata', () => {
    const result = transformDocument(raw, transactionId, index)
    expect(result.metadata.esignRequired).toBe('true')
  })

  it('falls back to transactionId:index as externalId when id is absent', () => {
    const result = transformDocument({ ...raw, id: undefined }, transactionId, 2)
    expect(result.externalId).toBe('txn_001:2')
  })

  it('passes DocumentSchema.parse without throwing', () => {
    const result = transformDocument(raw, transactionId, index)
    expect(() => DocumentSchema.parse(result)).not.toThrow()
  })
})

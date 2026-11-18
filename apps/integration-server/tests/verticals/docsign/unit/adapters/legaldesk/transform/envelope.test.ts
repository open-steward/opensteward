import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawLegaldeskTransaction,
} from '../../../../../../../src/verticals/docsign/adapters/legaldesk/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('legaldesk transformEnvelope', () => {
  const raw: RawLegaldeskTransaction = {
    transaction_id: 'txn_001',
    status: 'completed',
    title: 'Service Agreement',
    message: 'Please sign.',
    initiator_id: 'user_42',
    initiator_email: 'alice@example.com',
    initiator_name: 'Alice',
    signing_type: 'sequential',
    signers: [
      { signer_id: 'sig_1', signer_email: 'bob@example.com', signer_name: 'Bob', sign_order: 1 },
      {
        signer_id: 'sig_2',
        signer_email: 'carol@example.com',
        signer_name: 'Carol',
        sign_order: 2,
      },
    ],
    documents: [{ document_id: 'doc_1', document_name: 'Agreement.pdf' }],
    created_at: '2025-03-01T10:00:00.000Z',
    completed_at: '2025-03-10T15:00:00.000Z',
  }

  it('maps transaction_id to id and externalId', () => {
    const result = transformEnvelope(raw)
    expect(result.id).toBe('txn_001')
    expect(result.externalId).toBe('txn_001')
  })

  it('maps completed status correctly', () => {
    const result = transformEnvelope(raw)
    expect(result.status).toBe('completed')
  })

  it('maps title to subject', () => {
    const result = transformEnvelope(raw)
    expect(result.subject).toBe('Service Agreement')
  })

  it('maps senderEmail and senderName', () => {
    const result = transformEnvelope(raw)
    expect(result.senderEmail).toBe('alice@example.com')
    expect(result.senderName).toBe('Alice')
  })

  it('maps signerIds from signers array sorted by sign_order', () => {
    const result = transformEnvelope(raw)
    expect(result.signerIds).toEqual(['sig_1', 'sig_2'])
  })

  it('maps documentIds from documents array', () => {
    const result = transformEnvelope(raw)
    expect(result.documentIds).toEqual(['doc_1'])
  })

  it('maps signingOrder from signing_type', () => {
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('sequential')
  })

  it('maps createdAt and completedAt as ISO datetimes', () => {
    const result = transformEnvelope(raw)
    expect(result.createdAt).toBe('2025-03-01T10:00:00.000Z')
    expect(result.completedAt).toBe('2025-03-10T15:00:00.000Z')
  })

  it('sets platform to legaldesk', () => {
    const result = transformEnvelope(raw)
    expect(result.platform).toBe('legaldesk')
  })

  it('passes EnvelopeSchema validation', () => {
    const result = transformEnvelope(raw)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('falls back to draft status for unknown status strings', () => {
    const result = transformEnvelope({ ...raw, status: 'unknown_status' })
    expect(result.status).toBe('draft')
  })

  it('falls back to txn_id when transaction_id is absent', () => {
    const { transaction_id: _, ...rest } = raw
    const result = transformEnvelope({ ...rest, txn_id: 'txn_via_fallback' })
    expect(result.id).toBe('txn_via_fallback')
  })

  it('infers parallel signing order when sign_orders are equal', () => {
    const result = transformEnvelope({
      ...raw,
      signing_type: undefined,
      signers: [
        { signer_id: 's1', sign_order: 1 },
        { signer_id: 's2', sign_order: 1 },
      ],
    })
    expect(result.signingOrder).toBe('parallel')
  })
})

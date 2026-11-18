import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawProofTransaction,
} from '../../../../../../../src/verticals/docsign/adapters/proof/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('proof transformEnvelope', () => {
  const raw: RawProofTransaction = {
    id: 'txn_001',
    external_id: 'ext_001',
    status: 'completed',
    detailed_status: 'esign_complete',
    transaction_name: 'Mortgage Closing',
    message_to_signer: 'Please review and sign.',
    sender_name: 'Alice Lender',
    organization_id: 'org_99',
    date_created: '2026-01-10T08:00:00.000Z',
    date_updated: '2026-01-15T12:00:00.000Z',
    activation_time: '2026-01-10T09:00:00.000Z',
    expiration_time: '2026-04-10T08:00:00.000Z',
    signers: [
      { signer_id: 'sgn_001', email: 'bob@example.com', order: 1 },
      { signer_id: 'sgn_002', email: 'carol@example.com', order: 2 },
    ],
    documents: [{ id: 'doc_001', document_name: 'Closing Disclosure.pdf' }],
  }

  it('maps id from transaction id', () => {
    const result = transformEnvelope(raw)
    expect(result.id).toBe('txn_001')
  })

  it('maps externalId from external_id', () => {
    const result = transformEnvelope(raw)
    expect(result.externalId).toBe('ext_001')
  })

  it('maps completed status to completed', () => {
    const result = transformEnvelope(raw)
    expect(result.status).toBe('completed')
  })

  it('maps sent status to sent', () => {
    const result = transformEnvelope({ ...raw, status: 'sent', detailed_status: undefined })
    expect(result.status).toBe('sent')
  })

  it('maps expired status to expired', () => {
    const result = transformEnvelope({ ...raw, status: 'expired', detailed_status: undefined })
    expect(result.status).toBe('expired')
  })

  it('maps deleted status to voided', () => {
    const result = transformEnvelope({ ...raw, status: 'deleted', detailed_status: undefined })
    expect(result.status).toBe('voided')
  })

  it('maps started status to draft', () => {
    const result = transformEnvelope({ ...raw, status: 'started', detailed_status: undefined })
    expect(result.status).toBe('draft')
  })

  it('maps subject from transaction_name', () => {
    const result = transformEnvelope(raw)
    expect(result.subject).toBe('Mortgage Closing')
  })

  it('maps message from message_to_signer', () => {
    const result = transformEnvelope(raw)
    expect(result.message).toBe('Please review and sign.')
  })

  it('maps senderName from sender_name', () => {
    const result = transformEnvelope(raw)
    expect(result.senderName).toBe('Alice Lender')
  })

  it('detects sequential order when signers have distinct orders', () => {
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('sequential')
  })

  it('detects parallel order when no signers have order', () => {
    const result = transformEnvelope({
      ...raw,
      signers: [{ signer_id: 'sgn_001' }, { signer_id: 'sgn_002' }],
    })
    expect(result.signingOrder).toBe('parallel')
  })

  it('maps signerIds from signer_id fields', () => {
    const result = transformEnvelope(raw)
    expect(result.signerIds).toEqual(['sgn_001', 'sgn_002'])
  })

  it('maps documentIds from document id fields', () => {
    const result = transformEnvelope(raw)
    expect(result.documentIds).toEqual(['doc_001'])
  })

  it('maps createdAt as ISO datetime', () => {
    const result = transformEnvelope(raw)
    expect(result.createdAt).toBe('2026-01-10T08:00:00.000Z')
  })

  it('maps sentAt from activation_time', () => {
    const result = transformEnvelope(raw)
    expect(result.sentAt).toBe('2026-01-10T09:00:00.000Z')
  })

  it('maps completedAt from date_updated when status is completed', () => {
    const result = transformEnvelope(raw)
    expect(result.completedAt).toBe('2026-01-15T12:00:00.000Z')
  })

  it('does not set completedAt when status is not completed', () => {
    const result = transformEnvelope({ ...raw, status: 'sent', detailed_status: undefined })
    expect(result.completedAt).toBeUndefined()
  })

  it('maps expiresAt from expiration_time', () => {
    const result = transformEnvelope(raw)
    expect(result.expiresAt).toBe('2026-04-10T08:00:00.000Z')
  })

  it('sets platform to proof', () => {
    const result = transformEnvelope(raw)
    expect(result.platform).toBe('proof')
  })

  it('includes detailedStatus and organizationId in metadata', () => {
    const result = transformEnvelope(raw)
    expect(result.metadata.detailedStatus).toBe('esign_complete')
    expect(result.metadata.organizationId).toBe('org_99')
  })

  it('passes EnvelopeSchema.parse without throwing', () => {
    const result = transformEnvelope(raw)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})

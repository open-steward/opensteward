import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawXodoSignDocument,
} from '../../../../../../../src/verticals/docsign/adapters/xodo-sign/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('xodo-sign transformEnvelope', () => {
  it('maps a completed document to canonical Envelope', () => {
    const raw: RawXodoSignDocument = {
      document_hash: 'abc123',
      title: 'Employment Contract',
      message: 'Please review and sign.',
      requester_email: 'sender@example.com',
      custom_requester_name: 'HR Admin',
      custom_requester_email: 'hr@example.com',
      is_completed: 1,
      use_signer_order: 1,
      template_id: 'tmpl-xyz',
      created: 1735689600,
      sent: 1735776000,
      completed: 1736294400,
      expires: 1738886400,
      signers: [
        { id: 1, email: 'alice@example.com', name: 'Alice', order: 1 },
        { id: 2, email: 'bob@example.com', name: 'Bob', order: 2 },
      ],
      files: [
        { file_id: 'file-1', name: 'contract.pdf' },
        { file_id: 'file-2', name: 'annex.pdf' },
      ],
    }

    const result = transformEnvelope(raw)

    expect(result.id).toBe('abc123')
    expect(result.externalId).toBe('abc123')
    expect(result.status).toBe('completed')
    expect(result.subject).toBe('Employment Contract')
    expect(result.message).toBe('Please review and sign.')
    // custom_requester_email takes priority over requester_email
    expect(result.senderEmail).toBe('hr@example.com')
    expect(result.senderName).toBe('HR Admin')
    // use_signer_order=1 → sequential
    expect(result.signingOrder).toBe('sequential')
    // signers ordered by .order
    expect(result.signerIds).toEqual(['1', '2'])
    expect(result.documentIds).toEqual(['file-1', 'file-2'])
    expect(result.templateId).toBe('tmpl-xyz')
    expect(result.createdAt).toBeDefined()
    expect(result.sentAt).toBeDefined()
    expect(result.completedAt).toBeDefined()
    expect(result.expiresAt).toBeDefined()
    expect(result.platform).toBe('xodo-sign')

    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps status using boolean flags in priority order', () => {
    const base: RawXodoSignDocument = { document_hash: 'x' }

    expect(transformEnvelope({ ...base, is_cancelled: 1 }).status).toBe('voided')
    expect(transformEnvelope({ ...base, is_declined: 1 }).status).toBe('declined')
    expect(transformEnvelope({ ...base, is_completed: 1 }).status).toBe('completed')
    expect(transformEnvelope({ ...base, is_draft: 1 }).status).toBe('draft')
    // all false but a signer viewed → delivered
    expect(transformEnvelope({ ...base, signers: [{ email: 'a@b.com', viewed: 1 }] }).status).toBe(
      'delivered',
    )
    // all false but a signer sent → sent
    expect(transformEnvelope({ ...base, signers: [{ email: 'a@b.com', sent: 1 }] }).status).toBe(
      'sent',
    )
    // all false, no signer state → draft
    expect(transformEnvelope(base).status).toBe('draft')
  })

  it('sets templateId to document_hash when is_template flag set', () => {
    const raw: RawXodoSignDocument = { document_hash: 'tmpl-hash', is_template: true }
    const result = transformEnvelope(raw)
    expect(result.templateId).toBe('tmpl-hash')
  })

  it('marks parallel signing when use_signer_order absent', () => {
    const raw: RawXodoSignDocument = {
      document_hash: 'y',
      signers: [{ id: 10 }, { id: 20 }],
    }
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('parallel')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})

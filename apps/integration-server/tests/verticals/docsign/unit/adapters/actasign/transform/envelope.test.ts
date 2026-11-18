import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawActasignSigningProcess,
} from '../../../../../../../src/verticals/docsign/adapters/actasign/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('actasign transformEnvelope', () => {
  it('maps a completed signing process to canonical Envelope', () => {
    const raw: RawActasignSigningProcess = {
      id: 'proc-001',
      status: 'completed',
      title: 'Contract A',
      subject: 'Please sign the contract',
      message: 'Kindly review and sign.',
      signing_mode: 'sequential',
      signature_level: 'QES',
      creator: { id: 'u1', email: 'sender@example.com', name: 'Alice Sender' },
      template_id: 'tmpl-99',
      signatories: [
        { id: 'sig-1', order: 0, email: 'bob@example.com', name: 'Bob' },
        { id: 'sig-2', order: 1, email: 'carol@example.com', name: 'Carol' },
      ],
      documents: [{ id: 'doc-1' }, { id: 'doc-2' }],
      created_at: '2026-01-01T10:00:00.000Z',
      sent_at: '2026-01-02T10:00:00.000Z',
      completed_at: '2026-01-10T10:00:00.000Z',
      updated_at: '2026-01-10T10:00:00.000Z',
    }

    const result = transformEnvelope(raw)

    // id maps from raw.id
    expect(result.id).toBe('proc-001')
    expect(result.externalId).toBe('proc-001')
    // status 'completed' → 'completed'
    expect(result.status).toBe('completed')
    // subject prefers raw.subject over raw.title
    expect(result.subject).toBe('Please sign the contract')
    expect(result.message).toBe('Kindly review and sign.')
    expect(result.senderId).toBe('u1')
    expect(result.senderEmail).toBe('sender@example.com')
    expect(result.senderName).toBe('Alice Sender')
    // sequential signing mode from signing_mode field
    expect(result.signingOrder).toBe('sequential')
    // signatories sorted by order
    expect(result.signerIds).toEqual(['sig-1', 'sig-2'])
    expect(result.documentIds).toEqual(['doc-1', 'doc-2'])
    expect(result.templateId).toBe('tmpl-99')
    expect(result.platform).toBe('actasign')
    // metadata includes signatureLevel
    expect(result.metadata.signatureLevel).toBe('QES')

    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps status variations correctly', () => {
    const check = (status: string | undefined) => transformEnvelope({ id: 'x', status }).status

    expect(check('draft')).toBe('draft')
    expect(check('pending')).toBe('sent')
    expect(check('sent')).toBe('sent')
    expect(check('in_progress')).toBe('sent')
    expect(check('viewed')).toBe('delivered')
    expect(check('signed')).toBe('completed')
    expect(check('rejected')).toBe('declined')
    expect(check('cancelled')).toBe('voided')
    expect(check('voided')).toBe('voided')
    expect(check('expired')).toBe('expired')
    // unknown falls back to 'draft'
    expect(check('unknown_state')).toBe('draft')
    expect(check(undefined)).toBe('draft')
  })

  it('derives sequential order from signer order values when signing_mode absent', () => {
    const raw: RawActasignSigningProcess = {
      id: 'proc-002',
      signatories: [
        { id: 's1', order: 0 },
        { id: 's2', order: 1 },
      ],
    }
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('sequential')
    // signers sorted ascending by order
    expect(result.signerIds).toEqual(['s1', 's2'])
  })

  it('derives parallel order when all signers share the same order', () => {
    const raw: RawActasignSigningProcess = {
      id: 'proc-003',
      signatories: [
        { id: 's1', order: 0 },
        { id: 's2', order: 0 },
      ],
    }
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('parallel')
  })

  it('uses title as fallback subject when subject is absent', () => {
    const result = transformEnvelope({ id: 'x', title: 'The Title' })
    expect(result.subject).toBe('The Title')
  })

  it('produces empty documentIds and signerIds when arrays absent', () => {
    const result = transformEnvelope({ id: 'y' })
    expect(result.signerIds).toEqual([])
    expect(result.documentIds).toEqual([])
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})

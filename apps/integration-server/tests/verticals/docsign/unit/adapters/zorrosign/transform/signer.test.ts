import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawZorrosignRecipient,
} from '../../../../../../../src/verticals/docsign/adapters/zorrosign/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('ZorroSign transformSigner', () => {
  it('maps a fully-populated recipient to the canonical Signer shape', () => {
    const raw: RawZorrosignRecipient = {
      recipient_id: 'rcpt_001',
      email: 'jane.doe@acme.example',
      name: 'Jane Doe',
      role: 'signer',
      status: 'signed',
      signing_order: 1,
      sent_at: '2025-01-15T09:05:00.000Z',
      delivered_at: '2025-01-15T10:00:00.000Z',
      signed_at: '2025-02-01T14:20:00.000Z',
    }
    const result = transformSigner(raw, 'zpkg_001')

    // id is "<envelopeId>:<recipient_id>"
    expect(result.id).toBe('zpkg_001:rcpt_001')
    expect(result.externalId).toBe('rcpt_001')
    expect(result.envelopeId).toBe('zpkg_001')
    expect(result.email).toBe('jane.doe@acme.example')
    expect(result.name).toBe('Jane Doe')
    expect(result.role).toBe('signer')
    expect(result.status).toBe('signed')
    expect(result.routingOrder).toBe(1)
    expect(result.sentAt).toBe('2025-01-15T09:05:00.000Z')
    expect(result.deliveredAt).toBe('2025-01-15T10:00:00.000Z')
    expect(result.signedAt).toBe('2025-02-01T14:20:00.000Z')
    expect(result.platform).toBe('zorrosign')

    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps role variants correctly', () => {
    const cases: Array<[string, string]> = [
      ['signer', 'signer'],
      ['signee', 'signer'],
      ['approver', 'approver'],
      ['cc', 'cc'],
      ['carbon_copy', 'cc'],
      ['viewer', 'cc'],
      ['observer', 'cc'],
      ['in_person_signer', 'in_person_signer'],
      ['in_person', 'in_person_signer'],
      ['witness', 'witness'],
      ['editor', 'editor'],
      ['unknown_role', 'signer'],
    ]
    for (const [input, expected] of cases) {
      const result = transformSigner(
        { recipient_id: 'r', role: input, email: 'x@example.com' },
        'e1',
      )
      expect(result.role, `role=${input}`).toBe(expected)
    }
  })

  it('maps status variants correctly', () => {
    const cases: Array<[string, string]> = [
      ['completed', 'signed'],
      ['signed', 'signed'],
      ['approved', 'signed'],
      ['declined', 'declined'],
      ['rejected', 'declined'],
      ['delivered', 'delivered'],
      ['viewed', 'delivered'],
      ['opened', 'delivered'],
      ['sent', 'sent'],
      ['pending', 'sent'],
      ['other', 'created'],
    ]
    for (const [input, expected] of cases) {
      const result = transformSigner(
        { recipient_id: 'r', status: input, email: 'x@example.com' },
        'e1',
      )
      expect(result.status, `status=${input}`).toBe(expected)
    }
  })

  it('prefers delivered_at over viewed_at for deliveredAt', () => {
    const raw: RawZorrosignRecipient = {
      recipient_id: 'r',
      email: 'x@example.com',
      delivered_at: '2025-06-01T00:00:00.000Z',
      viewed_at: '2025-05-31T00:00:00.000Z',
    }
    const result = transformSigner(raw, 'e1')
    expect(result.deliveredAt).toBe('2025-06-01T00:00:00.000Z')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('falls back to viewed_at when delivered_at is absent', () => {
    const raw: RawZorrosignRecipient = {
      recipient_id: 'r',
      email: 'x@example.com',
      viewed_at: '2025-05-31T12:00:00.000Z',
    }
    const result = transformSigner(raw, 'e1')
    expect(result.deliveredAt).toBe('2025-05-31T12:00:00.000Z')
  })

  it('carries decline_reason to declineReason field', () => {
    const raw: RawZorrosignRecipient = {
      recipient_id: 'r',
      email: 'x@example.com',
      status: 'declined',
      declined_at: '2025-03-10T08:00:00.000Z',
      decline_reason: 'Terms need revision',
    }
    const result = transformSigner(raw, 'e1')
    expect(result.declineReason).toBe('Terms need revision')
    expect(result.declinedAt).toBe('2025-03-10T08:00:00.000Z')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})

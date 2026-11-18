import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawSignatureapiRecipient,
} from '../../../../../../../src/verticals/docsign/adapters/signatureapi/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('signatureapi transformSigner', () => {
  it('maps a completed signer recipient to canonical Signer', () => {
    const raw: RawSignatureapiRecipient = {
      id: 'rec-001',
      type: 'signer',
      key: 'buyer',
      name: 'Bob Smith',
      email: 'bob@example.com',
      status: 'completed',
      order: 1,
      sent_at: '2026-01-10T09:00:00.000Z',
      viewed_at: '2026-01-11T10:00:00.000Z',
      completed_at: '2026-01-12T14:00:00.000Z',
    }

    const result = transformSigner(raw, 'env-001')

    // id maps from raw.id
    expect(result.id).toBe('rec-001')
    expect(result.externalId).toBe('rec-001')
    expect(result.envelopeId).toBe('env-001')
    expect(result.email).toBe('bob@example.com')
    expect(result.name).toBe('Bob Smith')
    // signer type → 'signer'
    expect(result.role).toBe('signer')
    // completed → 'signed'
    expect(result.status).toBe('signed')
    // order field mapped directly
    expect(result.routingOrder).toBe(1)
    expect(result.sentAt).toBeDefined()
    expect(result.deliveredAt).toBeDefined()
    expect(result.signedAt).toBeDefined()
    expect(result.platform).toBe('signatureapi')
    expect(result.metadata.type).toBe('signer')

    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps role variants correctly', () => {
    const check = (type: string | undefined) =>
      transformSigner({ id: 'x', email: 'a@b.com', type }, 'env').role

    expect(check('signer')).toBe('signer')
    expect(check('automatic_signer')).toBe('signer')
    expect(check('approver')).toBe('approver')
    expect(check('preparer')).toBe('editor')
    // unknown falls back to 'signer'
    expect(check(undefined)).toBe('signer')
    expect(check('custom_role')).toBe('signer')
  })

  it('maps status variants correctly', () => {
    const check = (status: string | undefined) =>
      transformSigner({ id: 'x', email: 'a@b.com', status }, 'env').status

    expect(check('completed')).toBe('signed')
    expect(check('rejected')).toBe('declined')
    expect(check('sent')).toBe('sent')
    expect(check('pending')).toBe('created')
    expect(check('awaiting')).toBe('created')
    expect(check('soft_bounced')).toBe('auto_responded')
    expect(check('hard_bounced')).toBe('auto_responded')
    expect(check('failed')).toBe('auto_responded')
    expect(check(undefined)).toBe('created')
  })

  it('maps decline reason from reject_reason or decline_reason', () => {
    const r1 = transformSigner(
      { id: 'x', email: 'a@b.com', status: 'rejected', reject_reason: 'Not acceptable' },
      'env',
    )
    expect(r1.declineReason).toBe('Not acceptable')

    const r2 = transformSigner(
      { id: 'x', email: 'a@b.com', status: 'rejected', decline_reason: 'Terms unclear' },
      'env',
    )
    expect(r2.declineReason).toBe('Terms unclear')
  })

  it('maps rejected_at to declinedAt', () => {
    const result = transformSigner(
      { id: 'x', email: 'a@b.com', status: 'rejected', rejected_at: '2026-01-15T10:00:00.000Z' },
      'env',
    )
    expect(result.declinedAt).toBeDefined()
  })
})

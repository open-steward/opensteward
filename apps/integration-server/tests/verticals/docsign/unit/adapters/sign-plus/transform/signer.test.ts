import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawSignPlusRecipient,
} from '../../../../../../../src/verticals/docsign/adapters/sign-plus/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('sign-plus transformSigner', () => {
  it('maps a completed SIGNER recipient to canonical Signer', () => {
    const raw: RawSignPlusRecipient = {
      id: 'rec-001',
      uid: 'uid-abc',
      name: 'Bob Smith',
      email: 'bob@example.com',
      role: 'SIGNER',
      verification: { type: 'SMS', value: '+15550001234' },
    }

    const result = transformSigner(raw, 'env-001', 0, 'COMPLETED')

    // id maps from raw.id
    expect(result.id).toBe('rec-001')
    expect(result.externalId).toBe('rec-001')
    expect(result.envelopeId).toBe('env-001')
    expect(result.email).toBe('bob@example.com')
    expect(result.name).toBe('Bob Smith')
    // SIGNER → 'signer'
    expect(result.role).toBe('signer')
    // COMPLETED envelope → 'signed'
    expect(result.status).toBe('signed')
    // routingOrder is 0-indexed step + 1 = 1
    expect(result.routingOrder).toBe(1)
    expect(result.platform).toBe('sign-plus')
    expect(result.metadata.verificationType).toBe('SMS')

    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps role variants correctly', () => {
    const check = (role: string | undefined) =>
      transformSigner({ id: 'x', email: 'a@b.com', role }, 'env', 0, undefined).role

    expect(check('SIGNER')).toBe('signer')
    expect(check('RECEIVES_COPY')).toBe('cc')
    expect(check('IN_PERSON_SIGNER')).toBe('in_person_signer')
    expect(check('SENDER')).toBe('editor')
    // unknown falls back to 'signer'
    expect(check(undefined)).toBe('signer')
    expect(check('CUSTOM_ROLE')).toBe('signer')
  })

  it('maps status from envelope status', () => {
    const check = (envelopeStatus: string | undefined) =>
      transformSigner({ id: 'x', email: 'a@b.com' }, 'env', 0, envelopeStatus).status

    expect(check('COMPLETED')).toBe('signed')
    expect(check('DECLINED')).toBe('declined')
    expect(check('PENDING')).toBe('sent')
    expect(check('IN_PROGRESS')).toBe('sent')
    expect(check('DRAFT')).toBe('created')
    expect(check(undefined)).toBe('created')
  })

  it('falls back to compound id when raw.id absent', () => {
    const raw: RawSignPlusRecipient = { email: 'anon@example.com' }
    const result = transformSigner(raw, 'env-1', 2, 'PENDING')
    // id = raw.id ?? `${envelopeId}:${raw.email ?? routingOrder}`
    expect(result.id).toBe('env-1:anon@example.com')
    // externalId = raw.id ?? `${envelopeId}:${routingOrder}`
    expect(result.externalId).toBe('env-1:2')
    expect(result.routingOrder).toBe(3)
  })
})

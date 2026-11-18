import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawFptEcontractRecipient,
} from '../../../../../../../src/verticals/docsign/adapters/fpt-econtract/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('fpt-econtract transformSigner', () => {
  const envelopeId = 'CTR-001'

  const baseRaw: RawFptEcontractRecipient = {
    id: 'r1',
    recipientId: 'r1',
    email: 'signer@example.com',
    fullName: 'Bob Signer',
    name: 'Bob',
    role: 'signer',
    status: 'signed',
    signOrder: 1,
    sentAt: '2025-04-01T09:00:00.000Z',
    viewedAt: '2025-04-01T10:00:00.000Z',
    signedAt: '2025-04-02T11:00:00.000Z',
  }

  it('composes id as envelopeId:recipientId', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.id).toBe('CTR-001:r1')
    expect(result.externalId).toBe('r1')
  })

  it('maps envelopeId', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.envelopeId).toBe('CTR-001')
  })

  it('maps email', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.email).toBe('signer@example.com')
  })

  it('maps fullName to name (preferred over name)', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.name).toBe('Bob Signer')
  })

  it('maps role "signer" to signer', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.role).toBe('signer')
  })

  it('maps role "approver" to approver', () => {
    const result = transformSigner({ ...baseRaw, role: 'approver' }, envelopeId)
    expect(result.role).toBe('approver')
  })

  it('maps role "reviewer" to editor', () => {
    const result = transformSigner({ ...baseRaw, role: 'reviewer' }, envelopeId)
    expect(result.role).toBe('editor')
  })

  it('maps role "cc" to cc', () => {
    const result = transformSigner({ ...baseRaw, role: 'cc' }, envelopeId)
    expect(result.role).toBe('cc')
  })

  it('maps role "witness" to witness', () => {
    const result = transformSigner({ ...baseRaw, role: 'witness' }, envelopeId)
    expect(result.role).toBe('witness')
  })

  it('maps status "signed" to signed', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.status).toBe('signed')
  })

  it('maps status "rejected" to declined', () => {
    const result = transformSigner({ ...baseRaw, status: 'rejected' }, envelopeId)
    expect(result.status).toBe('declined')
  })

  it('maps status "viewed" to delivered', () => {
    const result = transformSigner({ ...baseRaw, status: 'viewed' }, envelopeId)
    expect(result.status).toBe('delivered')
  })

  it('maps status "pending" to sent', () => {
    const result = transformSigner({ ...baseRaw, status: 'pending' }, envelopeId)
    expect(result.status).toBe('sent')
  })

  it('defaults unknown status to created', () => {
    const result = transformSigner({ ...baseRaw, status: undefined }, envelopeId)
    expect(result.status).toBe('created')
  })

  it('maps signOrder to routingOrder', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.routingOrder).toBe(1)
  })

  it('maps sentAt', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.sentAt).toBe('2025-04-01T09:00:00.000Z')
  })

  it('maps deliveredAt from viewedAt', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.deliveredAt).toBe('2025-04-01T10:00:00.000Z')
  })

  it('maps signedAt', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.signedAt).toBe('2025-04-02T11:00:00.000Z')
  })

  it('sets platform to fpt-econtract', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.platform).toBe('fpt-econtract')
  })

  it('falls back externalId to email when id fields absent', () => {
    const result = transformSigner(
      { ...baseRaw, id: undefined, recipientId: undefined },
      envelopeId,
    )
    expect(result.externalId).toBe('signer@example.com')
  })

  it('produces a schema-valid Signer', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})

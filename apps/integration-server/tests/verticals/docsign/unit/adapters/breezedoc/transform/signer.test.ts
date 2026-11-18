import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawBreezedocRecipient,
} from '../../../../../../../src/verticals/docsign/adapters/breezedoc/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('breezedoc transformSigner', () => {
  it('maps a signed non-owner recipient to canonical Signer', () => {
    const raw: RawBreezedocRecipient = {
      id: 11,
      slug: 'alice-slug',
      email: 'alice@example.com',
      name: 'Alice Example',
      party: 0,
      owner: false,
      sent_at: '2026-01-11T09:00:00.000Z',
      opened_at: '2026-01-12T10:00:00.000Z',
      completed_at: '2026-01-15T14:00:00.000Z',
    }

    const result = transformSigner(raw, '101')

    expect(result.id).toBe('101:11')
    expect(result.externalId).toBe('11')
    expect(result.envelopeId).toBe('101')
    expect(result.email).toBe('alice@example.com')
    expect(result.name).toBe('Alice Example')
    // non-owner → 'signer'
    expect(result.role).toBe('signer')
    // completed_at present → 'signed'
    expect(result.status).toBe('signed')
    // party 0 → routingOrder 1 (0-indexed to 1-indexed)
    expect(result.routingOrder).toBe(1)
    expect(result.sentAt).toBe('2026-01-11T09:00:00.000Z')
    expect(result.deliveredAt).toBe('2026-01-12T10:00:00.000Z')
    expect(result.signedAt).toBe('2026-01-15T14:00:00.000Z')
    expect(result.platform).toBe('breezedoc')
    expect(result.metadata.slug).toBe('alice-slug')
    expect(result.metadata.party).toBe('0')

    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps an owner recipient to role cc', () => {
    const raw: RawBreezedocRecipient = {
      id: 10,
      email: 'owner@company.com',
      name: 'Owner User',
      owner: true,
      party: 0,
      completed_at: '2026-01-11T09:00:00.000Z',
    }

    const result = transformSigner(raw, '101')

    expect(result.role).toBe('cc')
    // id is still just String(r.id), not composite
    expect(result.externalId).toBe('10')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps status to delivered when opened_at present but not completed_at', () => {
    const raw: RawBreezedocRecipient = {
      id: 20,
      email: 'bob@example.com',
      name: 'Bob',
      owner: false,
      party: 1,
      sent_at: '2026-02-01T10:00:00.000Z',
      opened_at: '2026-02-02T10:00:00.000Z',
    }

    const result = transformSigner(raw, '102')

    expect(result.status).toBe('delivered')
    expect(result.routingOrder).toBe(2)
    expect(result.deliveredAt).toBe('2026-02-02T10:00:00.000Z')
    expect(result.signedAt).toBeUndefined()
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps status to sent when only sent_at is set', () => {
    const raw: RawBreezedocRecipient = {
      id: 30,
      email: 'carol@example.com',
      name: 'Carol',
      owner: false,
      party: 0,
      sent_at: '2026-03-01T08:00:00.000Z',
    }

    const result = transformSigner(raw, '103')

    expect(result.status).toBe('sent')
    expect(result.sentAt).toBe('2026-03-01T08:00:00.000Z')
    expect(result.deliveredAt).toBeUndefined()
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps status to created when no timestamps are set', () => {
    const raw: RawBreezedocRecipient = {
      id: 40,
      email: 'dave@example.com',
      name: 'Dave',
      owner: false,
    }

    const result = transformSigner(raw, '104')

    expect(result.status).toBe('created')
    expect(result.routingOrder).toBeUndefined()
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('uses string ids without modification', () => {
    const raw: RawBreezedocRecipient = {
      id: 'rec-xyz',
      email: 'eve@example.com',
      name: 'Eve',
      owner: false,
      party: 2,
    }

    const result = transformSigner(raw, 'env-99')

    expect(result.id).toBe('env-99:rec-xyz')
    expect(result.externalId).toBe('rec-xyz')
    expect(result.routingOrder).toBe(3)
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})

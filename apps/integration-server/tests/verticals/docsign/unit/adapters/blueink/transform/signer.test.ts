import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/blueink/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('blueink transformSigner', () => {
  const rawComplete = {
    id: 'pkt_1',
    key: 'key_1',
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+15551234567',
    status: 'co',
    deliver_via: 'email',
    person_id: 'person_abc',
    order: 1,
    completed_at: '2024-01-20T14:30:00.000Z',
    last_accessed_at: '2024-01-20T14:00:00.000Z',
    auth_sms: true,
    auth_selfie: false,
    auth_id: false,
  }

  it('maps id from packet id', () => {
    const result = transformSigner(rawComplete, 'bnd_abc123')
    expect(result.id).toBe('pkt_1')
  })

  it('maps externalId from packet id', () => {
    const result = transformSigner(rawComplete, 'bnd_abc123')
    expect(result.externalId).toBe('pkt_1')
  })

  it('maps envelopeId from parameter', () => {
    const result = transformSigner(rawComplete, 'bnd_abc123')
    expect(result.envelopeId).toBe('bnd_abc123')
  })

  it('maps email', () => {
    const result = transformSigner(rawComplete, 'bnd_abc123')
    expect(result.email).toBe('jane@example.com')
  })

  it('maps name', () => {
    const result = transformSigner(rawComplete, 'bnd_abc123')
    expect(result.name).toBe('Jane Doe')
  })

  it('role is always signer', () => {
    const result = transformSigner(rawComplete, 'bnd_abc123')
    expect(result.role).toBe('signer')
  })

  it('maps status co → signed', () => {
    const result = transformSigner(rawComplete, 'bnd_abc123')
    expect(result.status).toBe('signed')
  })

  it('maps status fa → declined', () => {
    const result = transformSigner({ ...rawComplete, status: 'fa' }, 'bnd_abc123')
    expect(result.status).toBe('declined')
  })

  it('maps status st → delivered', () => {
    const result = transformSigner({ ...rawComplete, status: 'st' }, 'bnd_abc123')
    expect(result.status).toBe('delivered')
  })

  it('maps status se → sent', () => {
    const result = transformSigner({ ...rawComplete, status: 'se' }, 'bnd_abc123')
    expect(result.status).toBe('sent')
  })

  it('maps status ex → auto_responded', () => {
    const result = transformSigner({ ...rawComplete, status: 'ex' }, 'bnd_abc123')
    expect(result.status).toBe('auto_responded')
  })

  it('maps status ca → auto_responded', () => {
    const result = transformSigner({ ...rawComplete, status: 'ca' }, 'bnd_abc123')
    expect(result.status).toBe('auto_responded')
  })

  it('maps status ne → created', () => {
    const result = transformSigner({ ...rawComplete, status: 'ne' }, 'bnd_abc123')
    expect(result.status).toBe('created')
  })

  it('maps status re → created', () => {
    const result = transformSigner({ ...rawComplete, status: 're' }, 'bnd_abc123')
    expect(result.status).toBe('created')
  })

  it('maps unknown status → created', () => {
    const result = transformSigner({ ...rawComplete, status: 'zz' }, 'bnd_abc123')
    expect(result.status).toBe('created')
  })

  it('maps routingOrder from order field (numeric)', () => {
    const result = transformSigner(rawComplete, 'bnd_abc123')
    expect(result.routingOrder).toBe(1)
  })

  it('maps routingOrder from string order field', () => {
    const result = transformSigner({ ...rawComplete, order: '3' }, 'bnd_abc123')
    expect(result.routingOrder).toBe(3)
  })

  it('maps signedAt from completed_at', () => {
    const result = transformSigner(rawComplete, 'bnd_abc123')
    expect(result.signedAt).toBe('2024-01-20T14:30:00.000Z')
  })

  it('sets platform to blueink', () => {
    const result = transformSigner(rawComplete, 'bnd_abc123')
    expect(result.platform).toBe('blueink')
  })

  it('includes deliverVia and phone in metadata', () => {
    const result = transformSigner(rawComplete, 'bnd_abc123')
    expect(result.metadata.deliverVia).toBe('email')
    expect(result.metadata.phone).toBe('+15551234567')
  })

  it('uses envelopeId:key as id when id is absent', () => {
    const { id: _id, ...withoutId } = rawComplete
    const result = transformSigner({ ...withoutId, key: 'kk_1' }, 'bnd_xyz')
    expect(result.id).toBe('kk_1')
    expect(result.externalId).toBe('kk_1')
  })

  it('passes SignerSchema.parse without throwing', () => {
    const result = transformSigner(rawComplete, 'bnd_abc123')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})

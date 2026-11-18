import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawGmoSignSigner,
} from '../../../../../../../src/verticals/docsign/adapters/gmo-sign/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('gmo-sign transformSigner', () => {
  const envelopeId = 'GMO-XID-001'

  const baseRaw: RawGmoSignSigner = {
    envelope_signer_id: 'SGN-1',
    envelope_sign_token: 'tok-abc',
    order_no: '1',
    name: 'Alice Signer',
    organize_name: 'Acme Corp',
    email: 'alice@example.com',
    phone_number: '+1-555-0100',
    sign_status: 'signed',
    signed_date: '2025-03-20T14:00:00.000Z',
  }

  it('composes id as envelopeId:envelope_signer_id', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.id).toBe('GMO-XID-001:SGN-1')
    expect(result.externalId).toBe('SGN-1')
  })

  it('maps envelopeId', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.envelopeId).toBe('GMO-XID-001')
  })

  it('maps email', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.email).toBe('alice@example.com')
  })

  it('maps name', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.name).toBe('Alice Signer')
  })

  it('maps sign_status "signed" to signed', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.status).toBe('signed')
  })

  it('maps sign_status "completed" to signed', () => {
    const result = transformSigner({ ...baseRaw, sign_status: 'completed' }, envelopeId)
    expect(result.status).toBe('signed')
  })

  it('maps sign_status "2" to signed', () => {
    const result = transformSigner({ ...baseRaw, sign_status: '2' }, envelopeId)
    expect(result.status).toBe('signed')
  })

  it('maps sign_status "declined" to declined', () => {
    const result = transformSigner({ ...baseRaw, sign_status: 'declined' }, envelopeId)
    expect(result.status).toBe('declined')
  })

  it('maps sign_status "viewed" to delivered', () => {
    const result = transformSigner({ ...baseRaw, sign_status: 'viewed' }, envelopeId)
    expect(result.status).toBe('delivered')
  })

  it('maps sign_status "sent" to sent', () => {
    const result = transformSigner({ ...baseRaw, sign_status: 'sent' }, envelopeId)
    expect(result.status).toBe('sent')
  })

  it('maps sign_status "1" to sent', () => {
    const result = transformSigner({ ...baseRaw, sign_status: '1' }, envelopeId)
    expect(result.status).toBe('sent')
  })

  it('defaults unknown sign_status to created', () => {
    const result = transformSigner({ ...baseRaw, sign_status: 'unknown' }, envelopeId)
    expect(result.status).toBe('created')
  })

  it('maps order_no to routingOrder', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.routingOrder).toBe(1)
  })

  it('always sets role to signer', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.role).toBe('signer')
  })

  it('sets platform to gmo-sign', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(result.platform).toBe('gmo-sign')
  })

  it('falls back id to envelopeId when envelope_signer_id and email are absent', () => {
    const result = transformSigner(
      { ...baseRaw, envelope_signer_id: undefined, email: undefined },
      envelopeId,
    )
    expect(result.id).toBe(envelopeId)
  })

  it('falls back externalId to email when envelope_signer_id absent', () => {
    const result = transformSigner({ ...baseRaw, envelope_signer_id: undefined }, envelopeId)
    expect(result.externalId).toBe('alice@example.com')
  })

  it('produces a schema-valid Signer', () => {
    const result = transformSigner(baseRaw, envelopeId)
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})

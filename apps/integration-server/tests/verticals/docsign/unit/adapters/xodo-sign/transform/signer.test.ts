import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawXodoSignSigner,
} from '../../../../../../../src/verticals/docsign/adapters/xodo-sign/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('xodo-sign transformSigner', () => {
  it('maps a signed signer to canonical Signer', () => {
    const raw: RawXodoSignSigner = {
      id: 1,
      name: 'Alice Signer',
      email: 'alice@example.com',
      role: 'Signer',
      order: 1,
      signed: true,
      signed_timestamp: 1736294400,
      sent: true,
      viewed: true,
      required: true,
      language: 'en',
    }

    const result = transformSigner(raw, 'doc-abc', 0)

    // id composed as envelopeId:externalId (raw.id)
    expect(result.id).toBe('doc-abc:1')
    expect(result.externalId).toBe('1')
    expect(result.envelopeId).toBe('doc-abc')
    expect(result.email).toBe('alice@example.com')
    expect(result.name).toBe('Alice Signer')
    expect(result.role).toBe('signer')
    // signed=true is strongest signal
    expect(result.status).toBe('signed')
    expect(result.routingOrder).toBe(1)
    expect(result.signedAt).toBeDefined()
    expect(result.platform).toBe('xodo-sign')
    expect(result.metadata.language).toBe('en')
    expect(result.metadata.required).toBe('true')

    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps status via boolean flag priority', () => {
    const base: RawXodoSignSigner = { id: 1, email: 'a@b.com', name: 'A' }

    expect(transformSigner({ ...base, signed: true }, 'env', 0).status).toBe('signed')
    expect(transformSigner({ ...base, declined: true }, 'env', 0).status).toBe('declined')
    expect(transformSigner({ ...base, viewed: true }, 'env', 0).status).toBe('delivered')
    expect(transformSigner({ ...base, sent: true }, 'env', 0).status).toBe('sent')
    // fall back to status label
    expect(transformSigner({ ...base, status: 'signed' }, 'env', 0).status).toBe('signed')
    expect(transformSigner({ ...base, status: 'declined' }, 'env', 0).status).toBe('declined')
    expect(transformSigner({ ...base, status: 'viewed' }, 'env', 0).status).toBe('delivered')
    expect(transformSigner({ ...base, status: 'sent' }, 'env', 0).status).toBe('sent')
    expect(transformSigner(base, 'env', 0).status).toBe('created')
  })

  it('sets declinedAt from declined_timestamp when declined', () => {
    const raw: RawXodoSignSigner = {
      id: 2,
      email: 'b@example.com',
      name: 'Bob',
      declined: true,
      declined_timestamp: 1736294400,
      declined_reason: 'Not authorized',
    }
    const result = transformSigner(raw, 'env-1', 0)
    expect(result.status).toBe('declined')
    expect(result.declinedAt).toBeDefined()
    expect(result.declineReason).toBe('Not authorized')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('falls back to order then index+1 when id absent', () => {
    const raw: RawXodoSignSigner = { email: 'c@example.com', name: 'C', order: 3 }
    const result = transformSigner(raw, 'env-2', 1)
    // id absent, order=3 → externalId='3'
    expect(result.externalId).toBe('3')
    expect(result.id).toBe('env-2:3')
  })

  it('omits routingOrder when order is 0', () => {
    const raw: RawXodoSignSigner = { id: 5, email: 'd@example.com', name: 'D', order: 0 }
    const result = transformSigner(raw, 'env-3', 0)
    expect(result.routingOrder).toBeUndefined()
  })
})

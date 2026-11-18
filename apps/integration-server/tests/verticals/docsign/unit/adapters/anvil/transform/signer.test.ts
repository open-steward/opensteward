import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawAnvilSigner,
} from '../../../../../../../src/verticals/docsign/adapters/anvil/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('anvil transformSigner', () => {
  it('maps a completed signer to canonical Signer', () => {
    const raw: RawAnvilSigner = {
      eid: 'sgn-001',
      name: 'Alice Smith',
      email: 'alice@example.com',
      status: 'completed',
      routingOrder: 1,
      signerType: 'email',
      signActionType: 'sign',
      signatureExperience: 'drawn',
      provider: 'anvil',
      completedAt: '2026-01-10T00:00:00.000Z',
    }

    const result = transformSigner(raw, 'pkt-001')

    // id maps from raw.eid
    expect(result.id).toBe('sgn-001')
    expect(result.externalId).toBe('sgn-001')
    expect(result.envelopeId).toBe('pkt-001')
    expect(result.email).toBe('alice@example.com')
    expect(result.name).toBe('Alice Smith')
    // every Anvil signer maps to 'signer' role
    expect(result.role).toBe('signer')
    // status 'completed' → 'signed'
    expect(result.status).toBe('signed')
    // routingOrder passes through directly (not incremented like some adapters)
    expect(result.routingOrder).toBe(1)
    expect(result.signedAt).toBeDefined()
    expect(result.platform).toBe('anvil')
    expect(result.metadata.signerType).toBe('email')

    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps status variants correctly', () => {
    const check = (status: string | undefined) =>
      transformSigner({ eid: 'x', status }, 'env').status

    expect(check('completed')).toBe('signed')
    expect(check('viewed')).toBe('delivered')
    expect(check('sent')).toBe('sent')
    expect(check('unknown')).toBe('created')
    expect(check(undefined)).toBe('created')
  })

  it('routingOrder passes through as-is (no +1 adjustment)', () => {
    // Anvil signers have 1-indexed routing order natively
    const result = transformSigner({ eid: 's', routingOrder: 3, status: 'sent' }, 'env')
    expect(result.routingOrder).toBe(3)
  })

  it('routingOrder is undefined when raw.routingOrder is not a number', () => {
    const result = transformSigner({ eid: 's', routingOrder: undefined }, 'env')
    expect(result.routingOrder).toBeUndefined()
    expect(result.email).toBeUndefined()
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('always returns signer role regardless of signerType', () => {
    const r1 = transformSigner({ eid: 'x', signerType: 'notarize' }, 'env')
    expect(r1.role).toBe('signer')
    const r2 = transformSigner({ eid: 'x', signerType: undefined }, 'env')
    expect(r2.role).toBe('signer')
  })
})

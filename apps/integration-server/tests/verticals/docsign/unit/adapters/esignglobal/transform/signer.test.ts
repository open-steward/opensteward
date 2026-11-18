import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  transformCcSigner,
  type RawEsignglobalCc,
} from '../../../../../../../src/verticals/docsign/adapters/esignglobal/transform/signer'
import type {
  RawEsignglobalEnvelope,
  RawEsignglobalSigner,
} from '../../../../../../../src/verticals/docsign/adapters/esignglobal/transform/envelope'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

const baseEnvelope: RawEsignglobalEnvelope = { envelopeId: 'env-001' }

describe('esignglobal transformSigner', () => {
  it('maps a signed signer (signerStatus=2) with sign date', () => {
    const raw: RawEsignglobalSigner = {
      businessId: 'biz-1',
      userEmail: 'alice@example.com',
      userName: 'Alice Smith',
      signOrder: 1,
      signerStatus: 2, // Signed
      signDate: 1694060763000, // epoch millis
    }
    const result = transformSigner(raw, baseEnvelope)

    expect(result.id).toBe('env-001:1:biz-1')
    expect(result.externalId).toBe('env-001:1:biz-1')
    expect(result.envelopeId).toBe('env-001')
    expect(result.email).toBe('alice@example.com')
    expect(result.name).toBe('Alice Smith')
    expect(result.role).toBe('signer')
    expect(result.status).toBe('signed')
    expect(result.routingOrder).toBe(1)
    expect(result.signedAt).toBeDefined()
    expect(result.platform).toBe('esignglobal')

    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps a pending signer (signerStatus=0) to status=sent', () => {
    const raw: RawEsignglobalSigner = {
      userEmail: 'bob@example.com',
      userName: 'Bob Jones',
      signOrder: 2,
      signerStatus: 0, // Pending
    }
    const result = transformSigner(raw, baseEnvelope)

    expect(result.status).toBe('sent')
    expect(result.routingOrder).toBe(2)
    expect(result.signedAt).toBeUndefined()
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps a signer in-progress (signerStatus=1) to status=delivered', () => {
    const raw: RawEsignglobalSigner = {
      userEmail: 'carol@example.com',
      signOrder: 1,
      signerStatus: 1, // Signing
    }
    const result = transformSigner(raw, baseEnvelope)

    expect(result.status).toBe('delivered')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps a rejected signer with rejectedReason → status=declined', () => {
    const raw: RawEsignglobalSigner = {
      userEmail: 'dave@example.com',
      signOrder: 1,
      signerStatus: 0,
      rejectedReason: 'Terms need review',
    }
    const result = transformSigner(raw, baseEnvelope)

    // rejectedReason presence overrides signerStatus mapping
    expect(result.status).toBe('declined')
    expect(result.declineReason).toBe('Terms need review')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})

describe('esignglobal transformCcSigner', () => {
  it('maps a CC recipient with role=cc and status=created', () => {
    const raw: RawEsignglobalCc = {
      userEmail: 'watcher@example.com',
      userName: 'Watcher Person',
    }
    const result = transformCcSigner(raw, baseEnvelope, 0)

    expect(result.id).toBe('env-001:cc:watcher@example.com')
    expect(result.role).toBe('cc')
    expect(result.status).toBe('created')
    expect(result.email).toBe('watcher@example.com')
    expect(result.name).toBe('Watcher Person')
    expect(result.platform).toBe('esignglobal')

    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})

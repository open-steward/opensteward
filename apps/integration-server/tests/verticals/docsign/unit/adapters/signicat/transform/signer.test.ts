import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawSignicatSigningSetup,
} from '../../../../../../../src/verticals/docsign/adapters/signicat/transform/signer'
import type { RawSignicatSigningSession } from '../../../../../../../src/verticals/docsign/adapters/signicat/transform/envelope'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('signicat transformSigner', () => {
  const baseSession: RawSignicatSigningSession = {
    id: 'session-001',
    createdAt: '2025-06-01T08:00:00.000Z',
    updatedAt: '2025-06-02T12:00:00.000Z',
    lifecycle: { state: 'SIGNED', stateIsFinal: true },
  }

  it('maps a signing setup to a synthetic Signer with status=signed', () => {
    const setup: RawSignicatSigningSetup = {
      identityProviders: [{ idpName: 'NO_BANKID' }, { idpName: 'SE_BANKID' }],
      signingFlow: 'REDIRECT',
    }
    const result = transformSigner(setup, baseSession, 0)

    expect(result.id).toBe('session-001:0')
    expect(result.externalId).toBe('session-001:0')
    expect(result.envelopeId).toBe('session-001')
    expect(result.status).toBe('signed')
    expect(result.role).toBe('signer')
    expect(result.routingOrder).toBe(1)
    expect(result.signedAt).toBe('2025-06-02T12:00:00.000Z')
    expect(result.platform).toBe('signicat')
    // Signicat eID platform never surfaces email; emit undefined so SignerSchema passes.
    expect(result.email).toBeUndefined()
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps a READY session to signer status=sent', () => {
    const session: RawSignicatSigningSession = {
      id: 'session-002',
      lifecycle: { state: 'READY' },
      createdAt: '2025-06-01T08:00:00.000Z',
    }
    const setup: RawSignicatSigningSetup = {
      identityProviders: [],
      signingFlow: 'REDIRECT',
    }
    const result = transformSigner(setup, session, 0)

    expect(result.status).toBe('sent')
    expect(result.sentAt).toBe('2025-06-01T08:00:00.000Z')
    expect(result.signedAt).toBeUndefined()
  })

  it('maps a REJECTED session to signer status=declined', () => {
    const session: RawSignicatSigningSession = {
      id: 'session-003',
      lifecycle: { state: 'REJECTED' },
      updatedAt: '2025-06-03T10:00:00.000Z',
    }
    const result = transformSigner({}, session, 1)

    expect(result.status).toBe('declined')
    expect(result.declinedAt).toBe('2025-06-03T10:00:00.000Z')
    expect(result.routingOrder).toBe(2)
  })
})

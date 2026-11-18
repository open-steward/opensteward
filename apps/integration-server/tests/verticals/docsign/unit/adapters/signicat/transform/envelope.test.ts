import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawSignicatSigningSession,
} from '../../../../../../../src/verticals/docsign/adapters/signicat/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('signicat transformEnvelope', () => {
  it('maps a SIGNED session to completed Envelope with document and signer ids', () => {
    const raw: RawSignicatSigningSession = {
      id: 'session-001',
      title: 'Employment Contract',
      externalReference: 'ext-ref-001',
      createdAt: '2025-06-01T08:00:00.000Z',
      updatedAt: '2025-06-02T12:00:00.000Z',
      dueDate: '2025-07-01T00:00:00.000Z',
      lifecycle: { state: 'SIGNED', stateIsFinal: true },
      documents: [{ documentId: 'doc-1' }, { documentId: 'doc-2' }],
      signingSetup: [{ identityProviders: [{ idpName: 'NO_BANKID' }], signingFlow: 'REDIRECT' }],
    }
    const result = transformEnvelope(raw)

    expect(result.id).toBe('session-001')
    expect(result.externalId).toBe('ext-ref-001')
    expect(result.status).toBe('completed')
    expect(result.subject).toBe('Employment Contract')
    expect(result.signingOrder).toBe('parallel')
    expect(result.documentIds).toEqual(['doc-1', 'doc-2'])
    expect(result.signerIds).toEqual(['session-001:0'])
    expect(result.completedAt).toBe('2025-06-02T12:00:00.000Z')
    expect(result.expiresAt).toBe('2025-07-01T00:00:00.000Z')
    expect(result.platform).toBe('signicat')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a READY session to sent status', () => {
    const raw: RawSignicatSigningSession = {
      id: 'session-002',
      lifecycle: { state: 'READY' },
      createdAt: '2025-06-01T08:00:00.000Z',
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('sent')
    expect(result.sentAt).toBe('2025-06-01T08:00:00.000Z')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps CANCELLED lifecycle state to voided status', () => {
    const raw: RawSignicatSigningSession = {
      id: 'session-003',
      lifecycle: { state: 'CANCELLED', stateIsFinal: true },
      updatedAt: '2025-06-03T10:00:00.000Z',
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('voided')
    expect(result.voidedAt).toBe('2025-06-03T10:00:00.000Z')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('uses session id as externalId when externalReference is absent', () => {
    const raw: RawSignicatSigningSession = {
      id: 'session-004',
      lifecycle: { state: 'EXPIRED' },
    }
    const result = transformEnvelope(raw)

    expect(result.externalId).toBe('session-004')
    expect(result.status).toBe('expired')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})

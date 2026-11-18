import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/signdesk/transform/signer'
import type { RawSigndeskSignatory } from '../../../../../../../src/verticals/docsign/adapters/signdesk/transform/envelope'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('signdesk transformSigner', () => {
  it('maps a signed signatory to canonical Signer', () => {
    const raw: RawSigndeskSignatory = {
      signatory_id: 'sig-001',
      name: 'Jane Doe',
      email: 'jane@example.com',
      signing_status: 'signed',
      signed_on: '2025-05-15T10:00:00.000Z',
      signing_sequence: 1,
      signatory_type: 'signer',
    }
    const result = transformSigner(raw, 'env-1', 0)

    expect(result.id).toBe('sig-001')
    expect(result.envelopeId).toBe('env-1')
    expect(result.email).toBe('jane@example.com')
    expect(result.name).toBe('Jane Doe')
    expect(result.status).toBe('signed')
    expect(result.role).toBe('signer')
    expect(result.routingOrder).toBe(1)
    expect(result.signedAt).toBe('2025-05-15T10:00:00.000Z')
    expect(result.platform).toBe('signdesk')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps a declined signatory with decline reason', () => {
    const raw: RawSigndeskSignatory = {
      signatory_id: 'sig-002',
      email: 'bob@example.com',
      name: 'Bob',
      declined_on: '2025-05-16T11:00:00.000Z',
      decline_reason: 'Terms not acceptable',
      signing_status: 'declined',
    }
    const result = transformSigner(raw, 'env-1', 1)

    expect(result.status).toBe('declined')
    expect(result.declinedAt).toBe('2025-05-16T11:00:00.000Z')
    expect(result.declineReason).toBe('Terms not acceptable')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps witness signatory_type to role=witness', () => {
    const raw: RawSigndeskSignatory = {
      signatory_id: 'sig-003',
      email: 'witness@example.com',
      name: 'Witness Person',
      signatory_type: 'witness',
      signing_status: 'pending',
    }
    const result = transformSigner(raw, 'env-2', 0)

    expect(result.role).toBe('witness')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('emits undefined email for mobile-only signatory (non-email value discarded)', () => {
    const raw: RawSigndeskSignatory = {
      signatory_id: 'sig-004',
      name: 'Mobile User',
      email: 'not-an-email',
      mobile: '+919876543210',
      signing_status: 'sent',
    }
    const result = transformSigner(raw, 'env-3', 0)

    expect(result.email).toBeUndefined()
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})

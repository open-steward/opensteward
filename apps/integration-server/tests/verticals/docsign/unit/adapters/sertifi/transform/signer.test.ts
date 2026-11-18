import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  participantSignerLevel,
  type RawSertifiParticipant,
} from '../../../../../../../src/verticals/docsign/adapters/sertifi/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('sertifi transformSigner', () => {
  it('maps a signed FirstSigner participant to canonical Signer', () => {
    const raw: RawSertifiParticipant = {
      userId: 'user-001',
      email: 'bob@example.com',
      participantType: 'FirstSigner',
      lastInvitedAt: '2026-01-10T09:00:00.000Z',
      lastVisitedAt: '2026-01-11T10:00:00.000Z',
      signed: '1',
      open: '0',
      enableIdCheck: false,
    }

    const result = transformSigner(raw, 'folder-001')

    // id is composed of envelopeId + externalId (userId)
    expect(result.id).toBe('folder-001:user-001')
    expect(result.externalId).toBe('user-001')
    expect(result.envelopeId).toBe('folder-001')
    expect(result.email).toBe('bob@example.com')
    // Sertifi participants carry no name fields
    expect(result.name).toBe('')
    // FirstSigner → 'signer' role
    expect(result.role).toBe('signer')
    // signed count > 0 → 'signed'
    expect(result.status).toBe('signed')
    // FirstSigner → routingOrder 1
    expect(result.routingOrder).toBe(1)
    expect(result.platform).toBe('sertifi')
    expect(result.metadata.participantType).toBe('FirstSigner')

    // email is valid so schema should pass
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps a CC participant to cc role', () => {
    const raw: RawSertifiParticipant = {
      userId: 'u-cc',
      email: 'cc@example.com',
      participantType: 'CC',
    }
    const result = transformSigner(raw, 'folder-001')
    expect(result.role).toBe('cc')
    // routingOrder is undefined for CC
    expect(result.routingOrder).toBeUndefined()
  })

  it('maps status from lastVisitedAt when not signed', () => {
    const raw: RawSertifiParticipant = {
      userId: 'u2',
      email: 'u2@example.com',
      participantType: 'SecondSigner',
      lastInvitedAt: '2026-01-10T09:00:00.000Z',
      lastVisitedAt: '2026-01-11T10:00:00.000Z',
      signed: '0',
    }
    const result = transformSigner(raw, 'env-1')
    expect(result.status).toBe('delivered')
  })

  it('maps status to sent when only lastInvitedAt present', () => {
    const raw: RawSertifiParticipant = {
      userId: 'u3',
      email: 'u3@example.com',
      participantType: 'ThirdSigner',
      lastInvitedAt: '2026-01-10T09:00:00.000Z',
      signed: '0',
    }
    const result = transformSigner(raw, 'env-1')
    expect(result.status).toBe('sent')
  })

  it('maps status to created when no invite/visit markers', () => {
    const raw: RawSertifiParticipant = {
      userId: 'u4',
      email: 'u4@example.com',
      participantType: 'FourthSigner',
    }
    const result = transformSigner(raw, 'env-1')
    expect(result.status).toBe('created')
  })

  it('falls back to email for externalId when userId absent', () => {
    const raw: RawSertifiParticipant = {
      email: 'fallback@example.com',
      participantType: 'FirstSigner',
    }
    const result = transformSigner(raw, 'env-1')
    expect(result.externalId).toBe('fallback@example.com')
    expect(result.email).toBe('fallback@example.com')
  })
})

describe('sertifi participantSignerLevel', () => {
  it('returns the 1-indexed level for named signer types', () => {
    expect(participantSignerLevel('FirstSigner')).toBe(1)
    expect(participantSignerLevel('TenthSigner')).toBe(10)
  })

  it('returns undefined for CC and unknown types', () => {
    expect(participantSignerLevel('CC')).toBeUndefined()
    expect(participantSignerLevel(undefined)).toBeUndefined()
    expect(participantSignerLevel('unknown')).toBeUndefined()
  })
})

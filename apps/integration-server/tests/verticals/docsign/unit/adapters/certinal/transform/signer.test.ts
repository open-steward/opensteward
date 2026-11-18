import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/certinal/transform/signer'
import type {
  RawCertinalCandidate,
  RawCertinalParticipant,
} from '../../../../../../../src/verticals/docsign/adapters/certinal/transform/envelope'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

const PARTICIPANT: RawCertinalParticipant = {
  id: 'part-1',
  status: 'COMPLETED',
  sequence: 1,
  role: 'SIGNER',
}

const CANDIDATE: RawCertinalCandidate = {
  id: 'cand-1',
  name: 'Jane Doe',
  emailAddress: 'jane@example.com',
  action: 'SIGNED',
  actionDate: '2025-02-01T00:00:00.000Z',
  language: 'en',
}

describe('certinal/transform/signer', () => {
  it('builds composite id as <participantId>:<candidateId>', () => {
    const out = transformSigner(CANDIDATE, PARTICIPANT, 'env-1')
    expect(out.id).toBe('part-1:cand-1')
  })

  it('maps candidateId → externalId', () => {
    const out = transformSigner(CANDIDATE, PARTICIPANT, 'env-1')
    expect(out.externalId).toBe('cand-1')
  })

  it('maps envelopeId through', () => {
    const out = transformSigner(CANDIDATE, PARTICIPANT, 'env-1')
    expect(out.envelopeId).toBe('env-1')
  })

  it('maps emailAddress → email', () => {
    const out = transformSigner(CANDIDATE, PARTICIPANT, 'env-1')
    expect(out.email).toBe('jane@example.com')
  })

  it('maps candidate name → name', () => {
    const out = transformSigner(CANDIDATE, PARTICIPANT, 'env-1')
    expect(out.name).toBe('Jane Doe')
  })

  it('maps SIGNER role → signer', () => {
    const out = transformSigner(CANDIDATE, PARTICIPANT, 'env-1')
    expect(out.role).toBe('signer')
  })

  it('maps CC role → cc', () => {
    const part = { ...PARTICIPANT, role: 'CC' }
    const out = transformSigner(CANDIDATE, part, 'env-1')
    expect(out.role).toBe('cc')
  })

  it('maps APPROVER role → approver', () => {
    const part = { ...PARTICIPANT, role: 'APPROVER' }
    const out = transformSigner(CANDIDATE, part, 'env-1')
    expect(out.role).toBe('approver')
  })

  it('maps participant status COMPLETED (with action SIGNED) → signed', () => {
    const out = transformSigner(CANDIDATE, PARTICIPANT, 'env-1')
    expect(out.status).toBe('signed')
  })

  it('maps action DECLINED → declined and sets declinedAt', () => {
    const cand: RawCertinalCandidate = {
      ...CANDIDATE,
      action: 'DECLINED',
      actionDate: '2025-02-05T00:00:00.000Z',
    }
    const part: RawCertinalParticipant = { ...PARTICIPANT, status: 'DECLINED' }
    const out = transformSigner(cand, part, 'env-1')
    expect(out.status).toBe('declined')
    expect(out.declinedAt).toBe('2025-02-05T00:00:00.000Z')
  })

  it('maps signedAt from actionDate when action = SIGNED', () => {
    const out = transformSigner(CANDIDATE, PARTICIPANT, 'env-1')
    expect(out.signedAt).toBe('2025-02-01T00:00:00.000Z')
  })

  it('maps sequence → routingOrder', () => {
    const out = transformSigner(CANDIDATE, PARTICIPANT, 'env-1')
    expect(out.routingOrder).toBe(1)
  })

  it('maps platform = certinal', () => {
    const out = transformSigner(CANDIDATE, PARTICIPANT, 'env-1')
    expect(out.platform).toBe('certinal')
  })

  it('stores participantId in metadata', () => {
    const out = transformSigner(CANDIDATE, PARTICIPANT, 'env-1')
    expect(out.metadata['participantId']).toBe('part-1')
  })

  it('emits a schema-valid Signer', () => {
    expect(() => SignerSchema.parse(transformSigner(CANDIDATE, PARTICIPANT, 'env-1'))).not.toThrow()
  })
})

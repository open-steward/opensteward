import { describe, it, expect } from 'vitest'
import {
  mapAuditAction,
  transformAuditTrailEntry,
  type RawConcordActivityAudit,
} from '../../../../../../../src/verticals/docsign/adapters/concord/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import { AUDIT_ACTIVITY_EXAMPLE } from './fixtures'

const activity = AUDIT_ACTIVITY_EXAMPLE as RawConcordActivityAudit

describe('concord transformAuditTrailEntry', () => {
  it('maps an ActivityAudit onto the canonical schema', () => {
    const out = AuditTrailEntrySchema.parse(transformAuditTrailEntry(activity, 'agr-1'))
    expect(out.id).toBe('agr-1:act-1')
    expect(out.externalId).toBe('act-1')
    expect(out.envelopeId).toBe('agr-1')
    expect(out.occurredAt).toBe('2016-02-29T16:39:42.000Z')
    expect(out.eventType).toBe('viewed')
    expect(out.description).toBe('AGREEMENT_VIEW')
    expect(out.actorId).toBe('14')
    expect(out.actorEmail).toBe('test@mail.fr')
    expect(out.actorName).toBe('userName')
    expect(out.actorIp).toBeUndefined()
    expect(out.metadata).toEqual({
      agreementStatus: 'CONTRACT',
      visibility: 'ALL',
      params: '',
      organization: 'My Organization',
    })
  })

  it('throws instead of inventing a time', () => {
    expect(() =>
      transformAuditTrailEntry({ ...activity, createdAt: undefined as unknown as number }, 'agr-1'),
    ).toThrow(/createdAt/)
  })

  it('maps actions by their documented descriptions', () => {
    expect(mapAuditAction('DRAFT_CREATE')).toBe('created')
    expect(mapAuditAction('AGREEMENT_SIGNATURE_REQUIRE')).toBe('sent')
    expect(mapAuditAction('NEGOTIATION_APPROVE')).toBe('signed')
    // "User signed using double authentication"
    expect(mapAuditAction('AGREEMENT_SIGNING_AUTHENTICATION')).toBe('signed')
    expect(mapAuditAction('AGREEMENT_SIGNATURE_FINALIZE')).toBe('completed')
    expect(mapAuditAction('AGREEMENT_OTP_VERIFIED')).toBe('authenticated')
    expect(mapAuditAction('INVITATION_BOUNCED')).toBe('delivery_failed')
    expect(mapAuditAction('CONTRACT_RENEW')).toBe('other')
  })
})

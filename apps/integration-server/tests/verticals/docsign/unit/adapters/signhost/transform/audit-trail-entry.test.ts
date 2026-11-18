/**
 * Signhost signer Activity -> canonical AuditTrailEntry, from the documented
 * example (see ./fixtures.ts), the Activity model
 * (https://developer.signhost.com/openapi/models/Activity.md) and "Statuses &
 * Activities" (https://developer.signhost.com/guide/features/status.md).
 */
import { describe, it, expect } from 'vitest'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import { transformAuditTrailEntry } from '../../../../../../../src/verticals/docsign/adapters/signhost/transform/audit-trail-entry'
import { TRANSACTION_EXAMPLE } from './fixtures'

const ENV = TRANSACTION_EXAMPLE.Id
const SIGNER = TRANSACTION_EXAMPLE.Signers[0]!

describe('Signhost transformAuditTrailEntry', () => {
  it('maps the documented DocumentOpened activity', () => {
    const act = SIGNER.Activities[2]!
    const out = AuditTrailEntrySchema.parse(transformAuditTrailEntry(act, SIGNER, ENV))
    expect(out.id).toBe(`${ENV}:c3d4e5f6-a7b8-49c0-d1e2-f3a4b5c6d7e8`)
    expect(out.externalId).toBe('c3d4e5f6-a7b8-49c0-d1e2-f3a4b5c6d7e8')
    expect(out.envelopeId).toBe(ENV)
    expect(out.occurredAt).toBe('2016-06-15T21:33:10.000Z')
    expect(out.eventType).toBe('viewed')
    expect(out.description).toBe('DocumentOpened')
    expect(out.actorId).toBe(SIGNER.Id)
    expect(out.actorEmail).toBe('user@example.com')
    expect(out.metadata).toEqual({ code: '105', info: 'contract.pdf' })
    expect(out.platform).toBe('signhost')
  })

  it('maps every activity of the documented example', () => {
    const types = SIGNER.Activities.map(
      (a) => AuditTrailEntrySchema.parse(transformAuditTrailEntry(a, SIGNER, ENV)).eventType,
    )
    // 101 sent, 103 viewed, 105 viewed, 203 signed, 301/401/302/402/303 other
    expect(types).toEqual([
      'sent',
      'viewed',
      'viewed',
      'signed',
      'other',
      'other',
      'other',
      'other',
      'other',
    ])
  })

  it.each([
    [104, 'auto_reminded'],
    [202, 'declined'],
    [204, 'reassigned'],
    [403, 'other'],
    [999, 'unknown'],
  ] as const)('maps documented Code %i to %s', (Code, expected) => {
    const act = { Id: 'a1', Code, Activity: 'x', CreatedDateTime: '2016-06-15T23:30:00+02:00' }
    expect(AuditTrailEntrySchema.parse(transformAuditTrailEntry(act, SIGNER, ENV)).eventType).toBe(
      expected,
    )
  })

  it('throws on an activity without CreatedDateTime', () => {
    const act = { Id: 'a1', Code: 101, Activity: 'InvitationSent' }
    expect(() => transformAuditTrailEntry(act, SIGNER, ENV)).toThrow(/CreatedDateTime/)
  })

  it('throws on an activity without Id', () => {
    const act = {
      Code: 101,
      Activity: 'InvitationSent',
      CreatedDateTime: '2016-06-15T23:30:00+02:00',
    }
    expect(() => transformAuditTrailEntry(act, SIGNER, ENV)).toThrow(/Id/)
  })
})

describe('Signhost transformAuditTrailEntry (review follow-ups)', () => {
  it('throws on an activity without the documented Activity description', () => {
    const act = { Id: 'a1', Code: 101, CreatedDateTime: '2016-06-15T23:30:00+02:00' }
    expect(() => transformAuditTrailEntry(act, SIGNER, ENV)).toThrow(/Activity/)
  })
})

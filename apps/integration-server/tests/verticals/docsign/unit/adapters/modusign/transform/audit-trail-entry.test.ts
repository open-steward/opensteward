import { describe, it, expect } from 'vitest'
import { transformAuditTrailEntry } from '../../../../../../../src/verticals/docsign/adapters/modusign/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import { SIGNING_COMPLETED, SIGNING_REQUEST, VERIFICATION_FAILURE } from '../fixtures'

describe('modusign transformAuditTrailEntry', () => {
  it('maps the documented SIGNING_COMPLETED example to a signed entry with the generator as actor', () => {
    const out = AuditTrailEntrySchema.parse(transformAuditTrailEntry(SIGNING_COMPLETED, 'doc_1', 3))
    expect(out).toMatchObject({
      id: 'doc_1:3',
      externalId: 'doc_1:3',
      envelopeId: 'doc_1',
      occurredAt: '2020-01-01T00:00:00.000Z',
      eventType: 'signed',
      description: '박참여(participant@mail.com)님이 문서에 서명하였습니다.',
      actorEmail: 'participant@mail.com',
      actorName: '박참여',
      actorIp: '255.255.255.0',
      platform: 'modusign',
    })
    expect(out.metadata).toMatchObject({
      action: 'SIGNING_COMPLETED',
      generatorType: 'PARTICIPANT',
    })
  })

  it('a SYSTEM generator has no actor; the target lands in metadata', () => {
    const out = AuditTrailEntrySchema.parse(transformAuditTrailEntry(SIGNING_REQUEST, 'doc_1', 0))
    expect(out.eventType).toBe('sent')
    expect(out.actorEmail).toBeUndefined()
    expect(out.actorName).toBeUndefined()
    expect(out.actorIp).toBeUndefined()
    expect(out.metadata).toMatchObject({
      generatorType: 'SYSTEM',
      targetName: '박참여',
      targetContact: 'participant@mail.com',
    })
  })

  it('an action with no canonical counterpart is other, and details.authType is kept', () => {
    const out = AuditTrailEntrySchema.parse(
      transformAuditTrailEntry(VERIFICATION_FAILURE, 'doc_1', 1),
    )
    expect(out.eventType).toBe('other')
    expect(out.metadata['authType']).toBe('PASSWORD')
  })

  it('a phone-number contact is not reported as an email', () => {
    const raw = {
      ...SIGNING_COMPLETED,
      generator: { ...SIGNING_COMPLETED.generator, contact: '01012345678' },
    }
    const out = AuditTrailEntrySchema.parse(transformAuditTrailEntry(raw, 'doc_1', 0))
    expect(out.actorEmail).toBeUndefined()
  })

  it.each([
    ['START_SIGNING_REQUEST', 'sent'],
    ['SIGNING_REQUEST', 'sent'],
    ['SIGNING_REQUEST_TO_HOST', 'sent'],
    ['START_VIEW_ONLY_REQUEST', 'sent'],
    ['VIEW_ONLY_REQUEST', 'sent'],
    ['FIRST_READING_DOCUMENT_IN_SIGNING_TURN', 'viewed'],
    ['READING_DOCUMENT_IN_SIGNING_TURN', 'viewed'],
    ['FIRST_READING_VIEW_ONLY_IN_OWN_TURN', 'viewed'],
    ['READING_VIEW_ONLY_IN_OWN_TURN', 'viewed'],
    ['VERIFICATION_COMPLETED', 'authenticated'],
    ['SIGNING_COMPLETED', 'signed'],
    ['SIGNING_COMPLETED_ALL', 'completed'],
    ['VIEW_ONLY_COMPLETED_ALL', 'completed'],
    ['REJECT_SIGNING', 'declined'],
    ['CANCEL_SIGNING_REQUEST', 'voided'],
    ['CANCEL_VIEW_ONLY_REQUEST', 'voided'],
    ['CORRECT_SIGNING', 'corrected'],
    ['REMIND_SIGNING', 'other'],
  ])('action %s → %s', (action, eventType) => {
    const out = AuditTrailEntrySchema.parse(
      transformAuditTrailEntry({ ...SIGNING_COMPLETED, action }, 'doc_1', 0),
    )
    expect(out.eventType).toBe(eventType)
  })

  it('throws rather than inventing a time when timestamp does not parse', () => {
    expect(() =>
      transformAuditTrailEntry({ ...SIGNING_COMPLETED, timestamp: 'not-a-date' }, 'doc_1', 0),
    ).toThrow(/no parseable timestamp/)
  })
})

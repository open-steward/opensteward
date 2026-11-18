import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type RawFoxitESignFolderHistoryEntry,
} from '../../../../../../../src/verticals/docsign/adapters/foxit-esign/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import { MYFOLDER_HISTORY } from './fixtures'

const history = MYFOLDER_HISTORY as RawFoxitESignFolderHistoryEntry[]

describe('foxit-esign transformAuditTrailEntry ("Folder History" of GET /folders/myfolder)', () => {
  it('maps the documented history row onto the canonical schema', () => {
    const out = AuditTrailEntrySchema.parse(transformAuditTrailEntry(history[3]!, '86377', 3))
    expect(out.id).toBe('86377:3')
    expect(out.externalId).toBe('86377:3')
    expect(out.envelopeId).toBe('86377')
    expect(out.occurredAt).toBe(new Date(1564738091000).toISOString())
    expect(out.eventType).toBe('signed')
    expect(out.description).toBe('Signed')
    expect(out.actorId).toBe('28')
    expect(out.platform).toBe('foxit-esign')
    expect(out.metadata).toEqual({
      action: 'Signed',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'janedoe@esigngenie.com',
    })
  })

  it('does not attribute the row name to the actor: InviteSentTo names the invitee', () => {
    // Row 5: Jane Doe is named, but changeDoneByParty is 1 (the author).
    const out = AuditTrailEntrySchema.parse(transformAuditTrailEntry(history[4]!, '86377', 4))
    expect(out.actorId).toBe('1')
    expect(out.actorEmail).toBeUndefined()
    expect(out.actorName).toBeUndefined()
  })

  it.each([
    ['Created', 'created'],
    ['InviteSentTo', 'sent'],
    ['InviteAccepted', 'viewed'],
    ['Signed', 'signed'],
    ['SomethingUndocumented', 'other'],
  ])('maps documented action %s to %s', (action, expected) => {
    const out = AuditTrailEntrySchema.parse(
      transformAuditTrailEntry({ ...history[0]!, action }, 'e', 0),
    )
    expect(out.eventType).toBe(expected)
  })

  it('every documented row parses', () => {
    history.forEach((h, i) => AuditTrailEntrySchema.parse(transformAuditTrailEntry(h, '86377', i)))
  })

  it('throws when action is missing rather than emitting an untyped row', () => {
    const { action: _a, ...noAction } = history[0]!
    expect(() =>
      transformAuditTrailEntry(noAction as RawFoxitESignFolderHistoryEntry, 'e', 0),
    ).toThrow(/action/)
  })

  it('throws when dateChanged is missing rather than inventing a time', () => {
    const { dateChanged: _d, ...noDate } = history[0]!
    expect(() =>
      transformAuditTrailEntry(noDate as RawFoxitESignFolderHistoryEntry, 'e', 0),
    ).toThrow(/dateChanged/)
  })
})

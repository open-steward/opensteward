import { describe, it, expect } from 'vitest'
import { transformAuditTrailEntry } from '../../../../../../../src/verticals/docsign/adapters/pandadoc/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import { AUDIT_TRAIL_EXAMPLE, EXAMPLE_DOCUMENT_ID } from '../fixtures'

const DOC = EXAMPLE_DOCUMENT_ID
const [created, sent, viewed] = AUDIT_TRAIL_EXAMPLE.results

describe('PandaDoc transformAuditTrailEntry (DocumentAuditTrailResponse.results[])', () => {
  it('maps the documented "new document" entry and parses as a canonical AuditTrailEntry', () => {
    const out = AuditTrailEntrySchema.parse(transformAuditTrailEntry(created!, DOC))
    expect(out).toEqual({
      id: `${DOC}:V9aG9KSREgTE8GnMqxWyzf`,
      externalId: 'V9aG9KSREgTE8GnMqxWyzf',
      envelopeId: DOC,
      occurredAt: '2025-05-22T09:03:19.000Z',
      eventType: 'created',
      description: 'new document',
      actorId: 'FA5QAu8UGA3oVDQZuPL75B',
      actorEmail: 'pandadoc@pandadoc.com',
      actorIp: '8.8.8.8',
      platform: 'pandadoc',
      metadata: { action: '1' },
      raw: created,
    })
  })

  it('maps action 6 to sent and action 8 to viewed, with the documented labels', () => {
    const s = AuditTrailEntrySchema.parse(transformAuditTrailEntry(sent!, DOC))
    expect(s.eventType).toBe('sent')
    expect(s.description).toBe('sent')
    expect(s.occurredAt).toBe('2025-05-22T09:03:49.000Z')
    const v = AuditTrailEntrySchema.parse(transformAuditTrailEntry(viewed!, DOC))
    expect(v.eventType).toBe('viewed')
    expect(v.description).toBe('viewed')
    expect(v.actorEmail).toBe('astronaut@nasa.com')
    expect(v.actorIp).toBe('128.156.0.0')
  })

  it('maps the documented signing, completion, decline and expiry codes', () => {
    const at = (action: number) =>
      AuditTrailEntrySchema.parse(transformAuditTrailEntry({ ...created!, action }, DOC))
    expect(at(9).eventType).toBe('signed')
    expect(at(7).eventType).toBe('completed')
    expect(at(43).eventType).toBe('declined')
    expect(at(13).eventType).toBe('expired')
    expect(at(23).eventType).toBe('reassigned')
    expect(at(49).eventType).toBe('authenticated')
    expect(at(11)).toMatchObject({ eventType: 'other', description: 'paid' })
  })

  // Every code with a canonical counterpart, against its documented label.
  it.each([
    [1, 'created', 'new document'],
    [6, 'sent', 'sent'],
    [7, 'completed', 'completed by all'],
    [8, 'viewed', 'viewed'],
    [9, 'signed', 'completed'],
    [13, 'expired', 'expired'],
    [19, 'expired', 'expired manually'],
    [23, 'reassigned', 'reassigned'],
    [27, 'declined', 'declined manually'],
    [43, 'declined', 'declined'],
    [47, 'authenticated', 'recipient verification with kba passed'],
    [48, 'authenticated', 'recipient verification with id passed'],
    [49, 'authenticated', 'recipient verification with text sms passed'],
    [50, 'authenticated', 'recipient verification with passcode passed'],
    [55, 'signed', 'recipient signed with QES'],
    [69, 'authenticated', 'recipient verification with email otp passed'],
    [11, 'other', 'paid'],
    [51, 'other', 'recipient verification with kba failed'],
  ])('maps action %i to %s ("%s")', (action, eventType, description) => {
    const out = AuditTrailEntrySchema.parse(transformAuditTrailEntry({ ...created!, action }, DOC))
    expect(out).toMatchObject({ eventType, description })
  })

  it('keeps a non-empty reason in metadata', () => {
    const out = AuditTrailEntrySchema.parse(
      transformAuditTrailEntry({ ...created!, action: 5, reason: 'Pricing is wrong' }, DOC),
    )
    expect(out.metadata).toEqual({ action: '5', reason: 'Pricing is wrong' })
  })

  it('does not report the sandbox "hidden" ip_address as an address', () => {
    const out = AuditTrailEntrySchema.parse(
      transformAuditTrailEntry({ ...created!, ip_address: 'hidden' }, DOC),
    )
    expect(out.actorIp).toBeUndefined()
  })

  it('throws instead of inventing an id or a timestamp', () => {
    expect(() => transformAuditTrailEntry({ ...created!, id: undefined }, DOC)).toThrow(/no id/)
    expect(() => transformAuditTrailEntry({ ...created!, date_created: undefined }, DOC)).toThrow(
      /date_created/,
    )
    expect(() => transformAuditTrailEntry({ ...created!, action: undefined }, DOC)).toThrow(
      /no action code/,
    )
  })
})

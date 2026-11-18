import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type RawOneSpanAuditEvent,
} from '../../../../../../../src/verticals/docsign/adapters/onespan-sign/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import { AUDIT_RESPONSE_EXAMPLE } from './fixtures'

const events = AUDIT_RESPONSE_EXAMPLE['audit-events'] as RawOneSpanAuditEvent[]
const PKG = AUDIT_RESPONSE_EXAMPLE['package-id']

describe('onespan-sign transformAuditTrailEntry', () => {
  it('maps the documented audit event onto the canonical schema', () => {
    const out = AuditTrailEntrySchema.parse(transformAuditTrailEntry(events[2]!, PKG, 2, 'UTC'))
    expect(out.id).toBe(`${PKG}:2`)
    expect(out.externalId).toBe(`${PKG}:2`)
    expect(out.envelopeId).toBe(PKG)
    expect(out.occurredAt).toBe('2016-04-20T14:23:31.000Z')
    expect(out.eventType).toBe('signed')
    expect(out.description).toBe('Click To Sign')
    expect(out.actorId).toBeUndefined()
    expect(out.actorName).toBe('somegroup')
    expect(out.actorEmail).toBe('9fe0d028-0572-4731-8520-99191340d78f@groups.esignlive.com')
    expect(out.actorIp).toBe('11.11.111.111')
    expect(out.platform).toBe('onespan-sign')
    expect(out.metadata).toEqual({ target: 'doc1', data: 'Approval: FAPOezPt0H8E' })
    expect(out.raw).toBe(events[2])
  })

  it('every documented event parses, and a null data is left out of metadata', () => {
    for (const [i, e] of events.entries()) {
      AuditTrailEntrySchema.parse(transformAuditTrailEntry(e, PKG, i, 'UTC'))
    }
    const view = transformAuditTrailEntry(events[1]!, PKG, 1, 'UTC')
    expect(view.metadata).toEqual({ target: 'doc1' })
  })

  it('maps only the documented types it can name; the rest are "other"', () => {
    expect(transformAuditTrailEntry(events[1]!, PKG, 1, 'UTC').eventType).toBe('viewed')
    expect(transformAuditTrailEntry(events[2]!, PKG, 2, 'UTC').eventType).toBe('signed')
    expect(transformAuditTrailEntry(events[0]!, PKG, 0, 'UTC').eventType).toBe('other')
  })

  it('reads the zone-less date-time as wall time in the configured zone', () => {
    // 2016-04-20 is EDT (UTC-4) in America/Toronto.
    const out = transformAuditTrailEntry(events[2]!, PKG, 2, 'America/Toronto')
    expect(out.occurredAt).toBe('2016-04-20T18:23:31.000Z')
    // January is EST (UTC-5): the offset follows the date, not the process.
    const winter = transformAuditTrailEntry(
      { ...events[2]!, 'date-time': '2016-01-20 14:23:31' },
      PKG,
      2,
      'America/Toronto',
    )
    expect(winter.occurredAt).toBe('2016-01-20T19:23:31.000Z')
  })

  it('uses the offset in force at the instant itself, just after a DST change', () => {
    // America/Toronto springs forward at 2016-03-13 02:00 EST (07:00Z). The
    // wall time 03:30 is EDT (UTC-4), although 03:30Z itself is still EST.
    const out = transformAuditTrailEntry(
      { ...events[2]!, 'date-time': '2016-03-13 03:30:00' },
      PKG,
      2,
      'America/Toronto',
    )
    expect(out.occurredAt).toBe('2016-03-13T07:30:00.000Z')
  })

  it('throws when date-time carries anything after the documented seconds', () => {
    for (const value of [
      '2016-04-20 14:14:51.123',
      '2016-04-20 14:14:51Z',
      '2016-04-20 14:14:51 +0000',
    ]) {
      expect(() =>
        transformAuditTrailEntry({ ...events[2]!, 'date-time': value }, PKG, 2, 'UTC'),
      ).toThrow(/date-time/)
    }
  })

  it('throws rather than inventing a timestamp when date-time is absent or not the documented format', () => {
    const { 'date-time': _drop, ...noDate } = events[2]!
    expect(() => transformAuditTrailEntry(noDate, PKG, 2, 'UTC')).toThrow(/date-time/)
    expect(() =>
      transformAuditTrailEntry({ ...events[2]!, 'date-time': '20/04/2016' }, PKG, 2, 'UTC'),
    ).toThrow(/date-time/)
  })

  it('throws when the required type is absent', () => {
    const { type: _drop, ...noType } = events[2]!
    expect(() => transformAuditTrailEntry(noType, PKG, 2, 'UTC')).toThrow(/type/)
  })
})

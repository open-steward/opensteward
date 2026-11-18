import { describe, it, expect } from 'vitest'
import { transformAuditTrailEntry } from '../../../../../../../src/verticals/docsign/adapters/scrive/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'
import { historyExample } from '../fixtures'

describe('scrive transformAuditTrailEntry (documented History Items example)', () => {
  it('maps the documented event', () => {
    const ev = historyExample().events![0]!
    const out = AuditTrailEntrySchema.parse(transformAuditTrailEntry(ev, '42', 0))
    expect(out.id).toBe('42:0')
    expect(out.envelopeId).toBe('42')
    expect(out.occurredAt).toBe('2015-06-06T17:50:15.000Z')
    expect(out.eventType).toBe('created')
    expect(out.description).toBe('The signing process was initiated.')
    expect(out.actorName).toBe('Not named party (1)')
  })

  it.each([
    ['signed', 'signed'],
    ['rejected', 'declined'],
    ['sealed', 'completed'],
    ['cancelled', 'voided'],
    ['timeouted', 'expired'],
    ['deliveryproblem', 'delivery_failed'],
    ['opened', 'viewed'],
    ['authenticated', 'authenticated'],
    ['prolonged', 'other'],
  ])('maps status %s to %s', (status, expected) => {
    const out = AuditTrailEntrySchema.parse(
      transformAuditTrailEntry({ ...historyExample().events![0]!, status }, '42', 0),
    )
    expect(out.eventType).toBe(expected)
  })

  it('throws rather than inventing a time', () => {
    expect(() => transformAuditTrailEntry({ status: 'signed', text: 'x' }, '42', 0)).toThrow(/time/)
  })
})

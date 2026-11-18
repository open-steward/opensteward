import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type SyntheticAuditEvent,
} from '../../../../../../../src/verticals/docsign/adapters/documenso/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('documenso transformAuditTrailEntry', () => {
  it('maps a signed audit event with actor details', () => {
    const event: SyntheticAuditEvent = {
      envelopeId: '42',
      occurredAt: '2025-01-05T00:00:00.000Z',
      type: 'signed',
      description: 'Alice signed the document',
      actorId: '1',
      actorEmail: 'alice@example.com',
      actorName: 'Alice',
    }
    const result = transformAuditTrailEntry(event, 0)

    expect(result.id).toBe('42:0')
    expect(result.externalId).toBe('42:0')
    expect(result.envelopeId).toBe('42')
    expect(result.occurredAt).toBe('2025-01-05T00:00:00.000Z')
    expect(result.eventType).toBe('signed')
    expect(result.description).toBe('Alice signed the document')
    expect(result.actorId).toBe('1')
    expect(result.actorEmail).toBe('alice@example.com')
    expect(result.actorName).toBe('Alice')
    expect(result.actorIp).toBeUndefined()
    expect(result.platform).toBe('documenso')

    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('maps a sent event (synthetic, no actor)', () => {
    const event: SyntheticAuditEvent = {
      envelopeId: '55',
      occurredAt: '2025-02-01T00:00:00.000Z',
      type: 'sent',
      description: 'Document sent to signers',
    }
    const result = transformAuditTrailEntry(event, 1)

    expect(result.id).toBe('55:1')
    expect(result.eventType).toBe('sent')
    expect(result.actorId).toBeUndefined()
    expect(result.actorEmail).toBeUndefined()
    expect(result.actorName).toBeUndefined()

    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('falls back to epoch when occurredAt is unparseable', () => {
    const event: SyntheticAuditEvent = {
      envelopeId: '99',
      occurredAt: 'not-a-date',
      type: 'other',
      description: 'Unknown event',
    }
    const result = transformAuditTrailEntry(event, 2)

    // toIso returns undefined for bad input; fallback is new Date(0).toISOString()
    expect(result.occurredAt).toBe(new Date(0).toISOString())

    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('uses index to disambiguate multiple events on same envelope', () => {
    const event: SyntheticAuditEvent = {
      envelopeId: '10',
      occurredAt: '2025-03-01T00:00:00.000Z',
      type: 'viewed',
      description: 'Viewed',
    }
    const r0 = transformAuditTrailEntry(event, 0)
    const r1 = transformAuditTrailEntry(event, 1)

    expect(r0.id).toBe('10:0')
    expect(r1.id).toBe('10:1')
    expect(r0.id).not.toBe(r1.id)
  })
})

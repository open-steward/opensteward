import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type SyntheticBreezedocAuditEvent,
} from '../../../../../../../src/verticals/docsign/adapters/breezedoc/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('breezedoc transformAuditTrailEntry', () => {
  it('maps a signed event with signer details to canonical AuditTrailEntry', () => {
    const event: SyntheticBreezedocAuditEvent = {
      envelopeId: '101',
      occurredIso: '2026-01-15T14:00:00.000Z',
      type: 'signed',
      signerExternalId: '11',
      signerEmail: 'alice@example.com',
      signerName: 'Alice Example',
      description: 'Alice Example signed the document',
    }

    const result = transformAuditTrailEntry(event, 3)

    expect(result.id).toBe('101:3')
    expect(result.externalId).toBe('101:3')
    expect(result.envelopeId).toBe('101')
    expect(result.occurredAt).toBe('2026-01-15T14:00:00.000Z')
    expect(result.eventType).toBe('signed')
    expect(result.description).toBe('Alice Example signed the document')
    expect(result.actorId).toBe('11')
    expect(result.actorEmail).toBe('alice@example.com')
    expect(result.actorName).toBe('Alice Example')
    expect(result.platform).toBe('breezedoc')
    expect(result.metadata.rawType).toBe('signed')

    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('maps a created event (no signer details) to canonical AuditTrailEntry', () => {
    const event: SyntheticBreezedocAuditEvent = {
      envelopeId: '101',
      occurredIso: '2026-01-10T08:00:00.000Z',
      type: 'created',
      description: 'Document created',
    }

    const result = transformAuditTrailEntry(event, 0)

    expect(result.id).toBe('101:0')
    expect(result.envelopeId).toBe('101')
    expect(result.eventType).toBe('created')
    expect(result.actorId).toBeUndefined()
    expect(result.actorEmail).toBeUndefined()
    expect(result.actorName).toBeUndefined()
    expect(result.metadata.rawType).toBe('created')

    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('maps all supported event types through the TYPE_MAP correctly', () => {
    const types: SyntheticBreezedocAuditEvent['type'][] = [
      'created',
      'sent',
      'viewed',
      'signed',
      'completed',
    ]

    for (const type of types) {
      const event: SyntheticBreezedocAuditEvent = {
        envelopeId: '200',
        occurredIso: '2026-03-01T10:00:00.000Z',
        type,
        description: `Event: ${type}`,
      }
      const result = transformAuditTrailEntry(event, 0)
      expect(result.eventType).toBe(type)
      expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
    }
  })

  it('uses index to construct unique composite id', () => {
    const event: SyntheticBreezedocAuditEvent = {
      envelopeId: '101',
      occurredIso: '2026-01-12T10:00:00.000Z',
      type: 'viewed',
      signerExternalId: '11',
      signerEmail: 'alice@example.com',
      signerName: 'Alice',
      description: 'Alice viewed the document',
    }

    const result0 = transformAuditTrailEntry(event, 0)
    const result5 = transformAuditTrailEntry(event, 5)

    expect(result0.id).toBe('101:0')
    expect(result5.id).toBe('101:5')
  })

  it('maps a sent event to canonical AuditTrailEntry', () => {
    const event: SyntheticBreezedocAuditEvent = {
      envelopeId: '102',
      occurredIso: '2026-02-01T09:00:00.000Z',
      type: 'sent',
      signerExternalId: '21',
      signerEmail: 'bob@example.com',
      signerName: 'Bob',
      description: 'Document sent to Bob',
    }

    const result = transformAuditTrailEntry(event, 1)

    expect(result.eventType).toBe('sent')
    expect(result.occurredAt).toBe('2026-02-01T09:00:00.000Z')
    expect(result.actorEmail).toBe('bob@example.com')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('maps a completed event to canonical AuditTrailEntry', () => {
    const event: SyntheticBreezedocAuditEvent = {
      envelopeId: '103',
      occurredIso: '2026-05-12T10:00:00.000Z',
      type: 'completed',
      description: 'All parties signed — envelope complete',
    }

    const result = transformAuditTrailEntry(event, 4)

    expect(result.eventType).toBe('completed')
    expect(result.id).toBe('103:4')
    expect(result.metadata.rawType).toBe('completed')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})

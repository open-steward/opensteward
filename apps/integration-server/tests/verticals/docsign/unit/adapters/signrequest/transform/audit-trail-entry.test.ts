import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type RawSignRequestEvent,
} from '../../../../../../../src/verticals/docsign/adapters/signrequest/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

const ENVELOPE_ID = 'doc-uuid-abc'

describe('signrequest transformAuditTrailEntry', () => {
  it('uses raw.uuid as id', () => {
    const raw: RawSignRequestEvent = {
      uuid: 'event-uuid-1',
      event_type: 'SIGNED',
      timestamp: '2024-02-01T14:20:00.000Z',
      document: { uuid: ENVELOPE_ID },
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.id).toBe('event-uuid-1')
    expect(result.externalId).toBe('event-uuid-1')
  })

  it('falls back to envelopeId:index when uuid absent', () => {
    const raw: RawSignRequestEvent = {
      event_type: 'SENT',
      timestamp: '2024-01-15T10:00:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 3)
    expect(result.id).toBe('doc-uuid-abc:3')
    expect(result.externalId).toBe('doc-uuid-abc:3')
  })

  it('maps envelopeId from argument', () => {
    const raw: RawSignRequestEvent = {
      uuid: 'event-1',
      event_type: 'SENT',
      timestamp: '2024-01-15T10:00:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.envelopeId).toBe(ENVELOPE_ID)
  })

  it('maps timestamp to occurredAt ISO', () => {
    const raw: RawSignRequestEvent = {
      uuid: 'event-1',
      event_type: 'SIGNED',
      timestamp: '2024-02-01T14:20:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.occurredAt).toBe('2024-02-01T14:20:00.000Z')
  })

  it('maps SIGNED event_type to signed', () => {
    const raw: RawSignRequestEvent = {
      uuid: 'event-1',
      event_type: 'SIGNED',
      timestamp: '2024-02-01T14:20:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.eventType).toBe('signed')
  })

  it('maps CONVERTED event_type to created', () => {
    const raw: RawSignRequestEvent = {
      uuid: 'event-2',
      event_type: 'CONVERTED',
      timestamp: '2024-01-15T10:00:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.eventType).toBe('created')
  })

  it('maps SENT_TO_SIGNER event_type to sent', () => {
    const raw: RawSignRequestEvent = {
      uuid: 'event-3',
      event_type: 'SENT_TO_SIGNER',
      timestamp: '2024-01-15T10:30:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.eventType).toBe('sent')
  })

  it('maps SIGNER_DECLINED event_type to declined', () => {
    const raw: RawSignRequestEvent = {
      uuid: 'event-4',
      event_type: 'SIGNER_DECLINED',
      timestamp: '2024-01-20T09:00:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.eventType).toBe('declined')
  })

  it('maps CANCELLED event_type to voided', () => {
    const raw: RawSignRequestEvent = {
      uuid: 'event-5',
      event_type: 'CANCELLED',
      timestamp: '2024-01-22T09:00:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.eventType).toBe('voided')
  })

  it('maps SIGNER_EMAIL_BOUNCED to delivery_failed', () => {
    const raw: RawSignRequestEvent = {
      uuid: 'event-6',
      event_type: 'SIGNER_EMAIL_BOUNCED',
      timestamp: '2024-01-15T11:00:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.eventType).toBe('delivery_failed')
  })

  it('maps unknown event_type to other', () => {
    const raw: RawSignRequestEvent = {
      uuid: 'event-7',
      event_type: 'SOMETHING_UNKNOWN',
      timestamp: '2024-01-15T12:00:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.eventType).toBe('other')
  })

  it('maps actor fields from nested signer', () => {
    const raw: RawSignRequestEvent = {
      uuid: 'event-1',
      event_type: 'SIGNED',
      timestamp: '2024-02-01T14:20:00.000Z',
      signer: {
        uuid: 'sr-signer-alice',
        email: 'alice@example.com',
        display_name: 'Alice Doe',
      },
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.actorId).toBe('sr-signer-alice')
    expect(result.actorEmail).toBe('alice@example.com')
    expect(result.actorName).toBe('Alice Doe')
  })

  it('uses event_type as description', () => {
    const raw: RawSignRequestEvent = {
      uuid: 'event-1',
      event_type: 'SIGNED',
      timestamp: '2024-02-01T14:20:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.description).toBe('SIGNED')
  })

  it('sets platform to signrequest', () => {
    const raw: RawSignRequestEvent = {
      uuid: 'event-1',
      event_type: 'SENT',
      timestamp: '2024-01-15T10:00:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.platform).toBe('signrequest')
  })

  it('passes AuditTrailEntrySchema.parse without throwing', () => {
    const raw: RawSignRequestEvent = {
      uuid: 'event-uuid-1',
      event_type: 'SIGNED',
      timestamp: '2024-02-01T14:20:00.000Z',
      delivered: true,
      status: 'ok',
      signer: {
        uuid: 'sr-signer-alice',
        email: 'alice@example.com',
        display_name: 'Alice Doe',
      },
      document: { uuid: ENVELOPE_ID },
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})

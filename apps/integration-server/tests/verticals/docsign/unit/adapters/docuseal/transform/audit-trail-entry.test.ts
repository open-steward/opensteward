import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type RawDocusealSubmissionEvent,
  type AuditActor,
} from '../../../../../../../src/verticals/docsign/adapters/docuseal/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('docuseal transformAuditTrailEntry', () => {
  it('maps a complete_form event to eventType=signed with actor', () => {
    const raw: RawDocusealSubmissionEvent = {
      id: 501,
      submitter_id: 201,
      event_type: 'complete_form',
      event_timestamp: '2025-01-05T00:00:00.000Z',
      data: { ip: '203.0.113.1' },
    }
    const actor: AuditActor = {
      email: 'bob@example.com',
      name: 'Bob Smith',
    }
    const result = transformAuditTrailEntry(raw, 101, 0, actor)

    expect(result.id).toBe('501')
    expect(result.externalId).toBe('501')
    expect(result.envelopeId).toBe('101')
    expect(result.occurredAt).toBe('2025-01-05T00:00:00.000Z')
    expect(result.eventType).toBe('signed')
    expect(result.description).toBe('complete_form')
    expect(result.actorId).toBe('201')
    expect(result.actorEmail).toBe('bob@example.com')
    expect(result.actorName).toBe('Bob Smith')
    expect(result.platform).toBe('docuseal')
    expect(result.metadata.eventType).toBe('complete_form')

    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('maps send_email event to eventType=sent', () => {
    const raw: RawDocusealSubmissionEvent = {
      id: 502,
      submitter_id: 202,
      event_type: 'send_email',
      event_timestamp: '2025-01-02T00:00:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, 101, 1)

    expect(result.eventType).toBe('sent')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('maps view_form event to eventType=viewed', () => {
    const raw: RawDocusealSubmissionEvent = {
      id: 503,
      submitter_id: 201,
      event_type: 'view_form',
      event_timestamp: '2025-01-03T00:00:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, 101, 2)

    expect(result.eventType).toBe('viewed')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('maps decline_form event to eventType=declined', () => {
    const raw: RawDocusealSubmissionEvent = {
      id: 504,
      submitter_id: 203,
      event_type: 'decline_form',
      event_timestamp: '2025-01-04T00:00:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, 101, 3)

    expect(result.eventType).toBe('declined')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('maps start_form event to eventType=created', () => {
    const raw: RawDocusealSubmissionEvent = {
      id: 505,
      submitter_id: 201,
      event_type: 'start_form',
      event_timestamp: '2025-01-03T06:00:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, 101, 4)

    expect(result.eventType).toBe('created')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('synthesises externalId from envelope+index when event id absent', () => {
    const raw: RawDocusealSubmissionEvent = {
      submitter_id: 201,
      event_type: 'send_email',
      event_timestamp: '2025-01-01T00:00:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, 200, 5)

    expect(result.id).toBe('200:5')
    expect(result.externalId).toBe('200:5')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('falls back to epoch when event_timestamp is absent', () => {
    const raw: RawDocusealSubmissionEvent = {
      id: 506,
      event_type: 'send_email',
    }
    const result = transformAuditTrailEntry(raw, 300, 0)

    expect(result.occurredAt).toBe(new Date(0).toISOString())
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('maps unknown event_type to eventType=other', () => {
    const raw: RawDocusealSubmissionEvent = {
      id: 507,
      event_type: 'custom_action_xyz',
      event_timestamp: '2025-06-01T00:00:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, 400, 0)

    expect(result.eventType).toBe('other')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})

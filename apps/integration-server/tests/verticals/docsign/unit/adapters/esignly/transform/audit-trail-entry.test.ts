import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type RawEsignlyAuditEvent,
} from '../../../../../../../src/verticals/docsign/adapters/esignly/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('esignly transformAuditTrailEntry', () => {
  it('maps a signed event with actor details', () => {
    const raw: RawEsignlyAuditEvent = {
      event_id: 'evt-001',
      action: 'document_signed',
      description: 'Alice signed the document',
      timestamp: '2026-01-15T14:22:00.000Z',
      actor_id: 'usr-alice',
      actor_email: 'alice@example.com',
      actor_name: 'Alice Smith',
      ip_address: '203.0.113.10',
    }
    const result = transformAuditTrailEntry(raw, 'env-001', 0)

    expect(result.id).toBe('env-001:0')
    expect(result.externalId).toBe('evt-001')
    expect(result.envelopeId).toBe('env-001')
    expect(result.occurredAt).toBe('2026-01-15T14:22:00.000Z')
    // 'signed' in action → eventType=signed
    expect(result.eventType).toBe('signed')
    expect(result.description).toBe('Alice signed the document')
    expect(result.actorId).toBe('usr-alice')
    expect(result.actorEmail).toBe('alice@example.com')
    expect(result.actorName).toBe('Alice Smith')
    expect(result.actorIp).toBe('203.0.113.10')
    expect(result.platform).toBe('esignly')

    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('maps a create event → eventType=created', () => {
    const raw: RawEsignlyAuditEvent = {
      action: 'envelope_created',
      created_at: '2026-01-10T09:00:00.000Z',
      user_email: 'sender@example.com',
    }
    const result = transformAuditTrailEntry(raw, 'env-002', 1)

    expect(result.eventType).toBe('created')
    expect(result.actorEmail).toBe('sender@example.com')
    expect(result.occurredAt).toBe('2026-01-10T09:00:00.000Z')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('maps a complete event → eventType=completed', () => {
    const raw: RawEsignlyAuditEvent = {
      event: 'envelope_complete',
      occurred_at: '2026-01-16T12:00:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, 'env-003', 2)

    // action falls back to event field; 'complete' → completed
    expect(result.eventType).toBe('completed')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('maps a view event → eventType=viewed', () => {
    const raw: RawEsignlyAuditEvent = {
      action: 'document_viewed',
      timestamp: '2026-01-12T10:00:00.000Z',
      signer_email: 'signer@example.com',
      signer_name: 'Bob Signer',
    }
    const result = transformAuditTrailEntry(raw, 'env-004', 0)

    expect(result.eventType).toBe('viewed')
    // signer_email as fallback actorEmail
    expect(result.actorEmail).toBe('signer@example.com')
    expect(result.actorName).toBe('Bob Signer')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('maps decline → declined', () => {
    const raw: RawEsignlyAuditEvent = {
      action: 'envelope_declined',
      timestamp: '2026-01-20T15:00:00.000Z',
      ip: '10.0.0.1',
    }
    const result = transformAuditTrailEntry(raw, 'env-005', 0)

    expect(result.eventType).toBe('declined')
    // ip fallback for actorIp
    expect(result.actorIp).toBe('10.0.0.1')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('falls back to epoch when no timestamp is present', () => {
    const raw: RawEsignlyAuditEvent = { action: 'unknown_action' }
    const result = transformAuditTrailEntry(raw, 'env-006', 0)

    // epoch fallback: new Date(0).toISOString()
    expect(result.occurredAt).toBe('1970-01-01T00:00:00.000Z')
    expect(result.eventType).toBe('other')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('uses index-based externalId when event_id absent', () => {
    const raw: RawEsignlyAuditEvent = {
      action: 'sent',
      timestamp: '2026-01-10T08:00:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, 'env-007', 5)

    expect(result.externalId).toBe('env-007:5')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})

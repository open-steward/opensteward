import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type SyntheticAuditEvent,
} from '../../../../../../../src/verticals/docsign/adapters/assently/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('assently transformAuditTrailEntry', () => {
  it('maps a synthetic completed event to canonical AuditTrailEntry', () => {
    const event: SyntheticAuditEvent = {
      envelopeId: 'case-001',
      occurredAt: '2026-01-10T00:00:00.000Z',
      type: 'completed',
      description: 'Case finished',
      actorId: 'usr-alice',
      actorEmail: 'alice@example.com',
      actorName: 'Alice Smith',
      actorIp: '203.0.113.1',
    }

    const result = transformAuditTrailEntry(event, 0)

    // id is envelopeId:index
    expect(result.id).toBe('case-001:0')
    // externalId is envelopeId:type:index (distinct from id)
    expect(result.externalId).toBe('case-001:completed:0')
    expect(result.envelopeId).toBe('case-001')
    expect(result.eventType).toBe('completed')
    expect(result.description).toBe('Case finished')
    expect(result.actorId).toBe('usr-alice')
    expect(result.actorEmail).toBe('alice@example.com')
    expect(result.actorName).toBe('Alice Smith')
    expect(result.actorIp).toBe('203.0.113.1')
    expect(result.platform).toBe('assently')
    expect(result.metadata.type).toBe('completed')

    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('passes eventType through directly from the synthetic event', () => {
    const types: SyntheticAuditEvent['type'][] = [
      'created',
      'sent',
      'viewed',
      'signed',
      'declined',
      'voided',
      'completed',
      'auto_reminded',
      'delivery_failed',
      'authenticated',
      'expired',
      'corrected',
      'reassigned',
      'other',
    ]
    for (const type of types) {
      const result = transformAuditTrailEntry({ envelopeId: 'env', type, description: 'x' }, 0)
      expect(result.eventType).toBe(type)
    }
  })

  it('falls back to epoch when occurredAt is absent', () => {
    const event: SyntheticAuditEvent = {
      envelopeId: 'case-x',
      type: 'created',
      description: 'Created',
    }
    const result = transformAuditTrailEntry(event, 0)
    expect(result.occurredAt).toBe(new Date(0).toISOString())
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('index is correctly incorporated into id and externalId', () => {
    const event: SyntheticAuditEvent = {
      envelopeId: 'env-5',
      type: 'signed',
      description: 'x',
      occurredAt: '2026-01-01T00:00:00.000Z',
    }
    const result = transformAuditTrailEntry(event, 7)
    expect(result.id).toBe('env-5:7')
    expect(result.externalId).toBe('env-5:signed:7')
  })
})

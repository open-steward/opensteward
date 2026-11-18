import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type SyntheticAuditEvent,
} from '../../../../../../../src/verticals/docsign/adapters/signiflow/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('signiflow transformAuditTrailEntry', () => {
  it('maps a SyntheticAuditEvent to canonical AuditTrailEntry', () => {
    const event: SyntheticAuditEvent = {
      envelopeId: 'doc-001',
      occurredAt: '2025-07-01T10:00:00.000Z',
      type: 'signed',
      description: 'Document signed by workstep participant',
      actorId: 'user-1',
      actorEmail: 'signer@example.com',
      actorName: 'Jane Signer',
    }
    const rawActivity = { WorkStepID: 42, Action: 'SignDocument' }
    const result = transformAuditTrailEntry(event, 0, rawActivity)

    expect(result.id).toBe('doc-001:0')
    expect(result.externalId).toBe('doc-001:0')
    expect(result.envelopeId).toBe('doc-001')
    expect(result.eventType).toBe('signed')
    expect(result.description).toBe('Document signed by workstep participant')
    expect(result.actorId).toBe('user-1')
    expect(result.actorEmail).toBe('signer@example.com')
    expect(result.actorName).toBe('Jane Signer')
    expect(result.occurredAt).toBe('2025-07-01T10:00:00.000Z')
    expect(result.raw).toBe(rawActivity)
    expect(result.platform).toBe('signiflow')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('falls back to the event itself as raw when rawActivity is not provided', () => {
    const event: SyntheticAuditEvent = {
      envelopeId: 'doc-002',
      occurredAt: '2025-07-02T09:00:00.000Z',
      type: 'sent',
      description: 'Workflow initiated',
    }
    const result = transformAuditTrailEntry(event, 1)

    expect(result.raw).toBe(event)
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('falls back to epoch when occurredAt is undefined', () => {
    const event: SyntheticAuditEvent = {
      envelopeId: 'doc-003',
      occurredAt: undefined,
      type: 'created',
      description: 'Document created',
    }
    const result = transformAuditTrailEntry(event, 0)

    expect(result.occurredAt).toBe(new Date(0).toISOString())
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})

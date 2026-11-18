import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type SyntheticAuditEvent,
} from '../../../../../../../src/verticals/docsign/adapters/certinal/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

const BASE_EVENT: SyntheticAuditEvent = {
  envelopeId: 'env-1',
  occurredAt: '2025-01-05T00:00:00.000Z',
  type: 'signed',
  description: 'Alice signed the document',
  actorId: 'user-1',
  actorName: 'Alice',
  actorEmail: 'alice@example.com',
  rawAction: 'SIGNED',
}

describe('certinal/transform/audit-trail-entry', () => {
  it('builds id as <envelopeId>:<index>', () => {
    const out = transformAuditTrailEntry(BASE_EVENT, 0)
    expect(out.id).toBe('env-1:0')
    expect(out.externalId).toBe('env-1:0')
  })

  it('maps envelopeId through', () => {
    const out = transformAuditTrailEntry(BASE_EVENT, 0)
    expect(out.envelopeId).toBe('env-1')
  })

  it('maps occurredAt to ISO string', () => {
    const out = transformAuditTrailEntry(BASE_EVENT, 0)
    expect(out.occurredAt).toBe('2025-01-05T00:00:00.000Z')
  })

  it('maps event type through', () => {
    const out = transformAuditTrailEntry(BASE_EVENT, 0)
    expect(out.eventType).toBe('signed')
  })

  it('maps description through', () => {
    const out = transformAuditTrailEntry(BASE_EVENT, 0)
    expect(out.description).toBe('Alice signed the document')
  })

  it('maps actor fields', () => {
    const out = transformAuditTrailEntry(BASE_EVENT, 0)
    expect(out.actorId).toBe('user-1')
    expect(out.actorName).toBe('Alice')
    expect(out.actorEmail).toBe('alice@example.com')
  })

  it('maps rawAction into metadata', () => {
    const out = transformAuditTrailEntry(BASE_EVENT, 0)
    expect(out.metadata['rawAction']).toBe('SIGNED')
  })

  it('maps platform = certinal', () => {
    const out = transformAuditTrailEntry(BASE_EVENT, 0)
    expect(out.platform).toBe('certinal')
  })

  it('falls back to epoch when occurredAt is missing', () => {
    const event: SyntheticAuditEvent = { ...BASE_EVENT, occurredAt: undefined }
    const out = transformAuditTrailEntry(event, 1)
    expect(out.occurredAt).toBe(new Date(0).toISOString())
  })

  it('produces unique ids with different index values', () => {
    const a = transformAuditTrailEntry(BASE_EVENT, 0)
    const b = transformAuditTrailEntry(BASE_EVENT, 1)
    expect(a.id).not.toBe(b.id)
  })

  it('emits a schema-valid AuditTrailEntry', () => {
    expect(() => AuditTrailEntrySchema.parse(transformAuditTrailEntry(BASE_EVENT, 0))).not.toThrow()
  })
})

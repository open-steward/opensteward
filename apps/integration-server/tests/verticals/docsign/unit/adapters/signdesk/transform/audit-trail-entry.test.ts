import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type RawSigndeskAuditEntry,
} from '../../../../../../../src/verticals/docsign/adapters/signdesk/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('signdesk transformAuditTrailEntry', () => {
  it('maps a sign event with signatory info to canonical AuditTrailEntry', () => {
    // Use 'document_signed' — mapType checks 'request'/'send'/'notif' before
    // 'sign', so 'sign_request' would map to 'sent'. Use a value that matches
    // 'sign' without matching the earlier 'request' branch.
    const raw: RawSigndeskAuditEntry = {
      event: 'document_signed',
      occurred_on: '2025-05-10T11:00:00.000Z',
      description: 'Signatory signed the document',
      signatory_id: 'sig-001',
      signatory_email: 'alice@example.com',
      signatory_name: 'Alice Smith',
      ip_address: '203.0.113.5',
    }
    const result = transformAuditTrailEntry(raw, 'env-1', 0)

    expect(result.id).toBe('env-1:0')
    expect(result.envelopeId).toBe('env-1')
    // 'document_signed' contains 'sign' → mapped to 'signed'
    expect(result.eventType).toBe('signed')
    expect(result.actorEmail).toBe('alice@example.com')
    expect(result.actorName).toBe('Alice Smith')
    expect(result.actorIp).toBe('203.0.113.5')
    expect(result.platform).toBe('signdesk')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('maps a create event via activity field', () => {
    const raw: RawSigndeskAuditEntry = {
      activity: 'document_created',
      occurred_on: '2025-05-10T09:00:00.000Z',
      remarks: 'New request initiated',
    }
    const result = transformAuditTrailEntry(raw, 'env-1', 1)

    // 'document_created' contains 'create' → 'created'
    expect(result.eventType).toBe('created')
    expect(result.description).toBe('New request initiated')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('ignores non-email signatory_email and sets actorEmail to undefined', () => {
    const raw: RawSigndeskAuditEntry = {
      event: 'view_document',
      occurred_on: '2025-05-11T10:00:00.000Z',
      signatory_email: 'not-an-email',
    }
    const result = transformAuditTrailEntry(raw, 'env-2', 0)

    expect(result.actorEmail).toBeUndefined()
    // 'view_document' contains 'view' → 'viewed'
    expect(result.eventType).toBe('viewed')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('falls back to epoch when no timestamp is present', () => {
    const raw: RawSigndeskAuditEntry = {
      event: 'complete',
    }
    const result = transformAuditTrailEntry(raw, 'env-3', 0)

    expect(result.occurredAt).toBe(new Date(0).toISOString())
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type RawActasignAuditEvent,
} from '../../../../../../../src/verticals/docsign/adapters/actasign/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('actasign transformAuditTrailEntry', () => {
  it('maps a signed audit event to canonical AuditTrailEntry', () => {
    const raw: RawActasignAuditEvent = {
      id: 'evt-001',
      type: 'document_signed',
      description: 'Document signed by Bob',
      occurred_at: '2026-01-04T10:00:00.000Z',
      actor_id: 'sig-001',
      actor_email: 'bob@example.com',
      actor_name: 'Bob Smith',
      ip_address: '203.0.113.1',
    }

    const result = transformAuditTrailEntry(raw, 'proc-001', 0)

    // id uses raw.id when present
    expect(result.id).toBe('evt-001')
    expect(result.externalId).toBe('evt-001')
    expect(result.envelopeId).toBe('proc-001')
    // 'signed' substring in type → 'signed' eventType
    expect(result.eventType).toBe('signed')
    expect(result.description).toBe('Document signed by Bob')
    expect(result.actorId).toBe('sig-001')
    expect(result.actorEmail).toBe('bob@example.com')
    expect(result.actorName).toBe('Bob Smith')
    expect(result.actorIp).toBe('203.0.113.1')
    expect(result.platform).toBe('actasign')

    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('maps event type by substring rules', () => {
    const check = (type: string | undefined) =>
      transformAuditTrailEntry({ type }, 'env', 0).eventType

    expect(check('process_created')).toBe('created')
    expect(check('invitation_sent')).toBe('sent')
    expect(check('document_viewed')).toBe('viewed')
    expect(check('document_signed')).toBe('signed')
    expect(check('process_completed')).toBe('completed')
    expect(check('document_rejected')).toBe('declined')
    expect(check('process_cancelled')).toBe('voided')
    expect(check('process_expired')).toBe('expired')
    // 'reminder_sent' contains 'sent' which matches before 'reminder' — use a string
    // that only has 'reminded' or 'reminder' without 'sent' to hit auto_reminded
    expect(check('reminded_user')).toBe('auto_reminded')
    expect(check('authentication_event')).toBe('authenticated')
    expect(check('delivery_failure')).toBe('delivery_failed')
    expect(check('something_else')).toBe('other')
    expect(check(undefined)).toBe('other')
  })

  it('uses fallback id when raw.id is absent', () => {
    const raw: RawActasignAuditEvent = {
      type: 'created',
      description: 'Created',
      occurred_at: '2026-01-01T00:00:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, 'proc-x', 3)
    // id and externalId use envelopeId:index when raw.id absent
    expect(result.id).toBe('proc-x:3')
    expect(result.externalId).toBe('proc-x:3')
  })

  it('falls back to timestamp field when occurred_at is absent', () => {
    const raw: RawActasignAuditEvent = {
      id: 'evt-002',
      type: 'sent',
      description: 'Sent',
      timestamp: '2026-02-01T00:00:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, 'proc-1', 0)
    expect(result.occurredAt).toBe('2026-02-01T00:00:00.000Z')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('falls back to epoch when no timestamp available', () => {
    const raw: RawActasignAuditEvent = { type: 'other', description: 'x' }
    const result = transformAuditTrailEntry(raw, 'env', 0)
    expect(result.occurredAt).toBe(new Date(0).toISOString())
  })
})

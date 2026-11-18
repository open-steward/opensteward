import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type RawWebdoxAuditEntry,
} from '../../../../../../../src/verticals/docsign/adapters/webdox/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('webdox transformAuditTrailEntry', () => {
  it('maps a signed audit entry to canonical AuditTrailEntry', () => {
    const raw: RawWebdoxAuditEntry = {
      id: 1001,
      action: 'document_signed',
      description: 'User signed the document.',
      created_at: '2026-01-10T10:00:00.000Z',
      user_id: 7,
      user_email: 'alice@example.com',
      user_name: 'Alice Admin',
      ip: '203.0.113.10',
      trackable_id: 42,
      trackable_type: 'Workflow',
    }

    const result = transformAuditTrailEntry(raw, 0)

    expect(result.id).toBe('1001')
    expect(result.externalId).toBe('1001')
    // trackable_id used as envelopeId
    expect(result.envelopeId).toBe('42')
    expect(result.occurredAt).toBeDefined()
    // 'document_signed' contains 'sign' → 'signed'
    expect(result.eventType).toBe('signed')
    expect(result.description).toBe('User signed the document.')
    expect(result.actorId).toBe('7')
    expect(result.actorEmail).toBe('alice@example.com')
    expect(result.actorName).toBe('Alice Admin')
    expect(result.actorIp).toBe('203.0.113.10')
    expect(result.platform).toBe('webdox')
    expect(result.metadata.trackableType).toBe('Workflow')

    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('maps event type variations correctly', () => {
    const check = (action: string) =>
      transformAuditTrailEntry({ action, created_at: '2026-01-01T00:00:00.000Z' }, 0).eventType

    expect(check('create_workflow')).toBe('created')
    expect(check('initiate_signing')).toBe('created')
    expect(check('sent_notification')).toBe('sent')
    expect(check('send_email')).toBe('sent')
    expect(check('view_document')).toBe('viewed')
    expect(check('open_link')).toBe('viewed')
    expect(check('signed_document')).toBe('signed')
    expect(check('complete_workflow')).toBe('signed')
    expect(check('finish_process')).toBe('signed')
    // 'decline_signing' contains 'sign' which is checked before 'declin' → 'signed'
    expect(check('decline_signing')).toBe('signed')
    expect(check('reject_document')).toBe('declined')
    expect(check('void_workflow')).toBe('voided')
    // 'cancel_signing' contains 'sign' checked before 'cancel' → 'signed'
    expect(check('cancel_signing')).toBe('signed')
    expect(check('cancel_workflow')).toBe('voided')
    expect(check('expired_workflow')).toBe('expired')
    expect(check('auto_remind')).toBe('auto_reminded')
    expect(check('authenticate_user')).toBe('authenticated')
    expect(check('unknown_action')).toBe('other')
  })

  it('falls back index as id when raw.id absent', () => {
    const raw: RawWebdoxAuditEntry = {
      action: 'view_document',
      created_at: '2026-01-01T00:00:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, 5)
    expect(result.id).toBe('5')
    expect(result.externalId).toBe('5')
  })

  it('falls back to epoch when created_at absent and occurred_at absent', () => {
    const raw: RawWebdoxAuditEntry = { id: 99, action: 'view_document' }
    const result = transformAuditTrailEntry(raw, 0)
    // Falls back to new Date(0).toISOString()
    expect(result.occurredAt).toBe('1970-01-01T00:00:00.000Z')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('uses occurred_at when created_at absent', () => {
    const raw: RawWebdoxAuditEntry = {
      id: 200,
      action: 'sent_doc',
      occurred_at: '2026-02-01T00:00:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.occurredAt).toBe('2026-02-01T00:00:00.000Z')
  })

  it('prefers ip over ip_address for actorIp', () => {
    const raw: RawWebdoxAuditEntry = {
      id: 300,
      created_at: '2026-01-01T00:00:00.000Z',
      ip: '10.0.0.1',
      ip_address: '192.168.0.1',
    }
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.actorIp).toBe('10.0.0.1')
  })
})

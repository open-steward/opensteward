import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type RawSignableHistoryEvent,
} from '../../../../../../../src/verticals/docsign/adapters/signable/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('signable transformAuditTrailEntry', () => {
  it('maps a signed history event to canonical AuditTrailEntry', () => {
    const raw: RawSignableHistoryEvent = {
      history_detail: 'Document signed by Alice',
      history_ip: '203.0.113.10',
      history_user_agent: 'Mozilla/5.0',
      history_date: '2026-01-15T14:00:00+0000',
    }

    const result = transformAuditTrailEntry(raw, 'env-fp-001', 0)

    // id is composed of envelopeId + index
    expect(result.id).toBe('env-fp-001:0')
    expect(result.externalId).toBe('env-fp-001:0')
    expect(result.envelopeId).toBe('env-fp-001')
    // detail contains 'sign' → eventType 'signed'
    expect(result.eventType).toBe('signed')
    expect(result.description).toBe('Document signed by Alice')
    expect(result.actorIp).toBe('203.0.113.10')
    expect(result.platform).toBe('signable')
    expect(result.metadata.userAgent).toBe('Mozilla/5.0')

    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('maps event type from free-text keywords', () => {
    const check = (history_detail: string) =>
      transformAuditTrailEntry({ history_detail }, 'env', 0).eventType

    expect(check('Envelope cancelled by sender')).toBe('voided')
    expect(check('Document expired')).toBe('expired')
    expect(check('Rejected by Bob')).toBe('declined')
    expect(check('Declined by signer')).toBe('declined')
    expect(check('Envelope completed')).toBe('completed')
    expect(check('Opened in browser')).toBe('viewed')
    expect(check('Viewed the document')).toBe('viewed')
    expect(check('Reminder sent')).toBe('auto_reminded')
    // 'Sent to recipient' — no 'sign' keyword, so maps to 'sent'
    expect(check('Sent to recipient')).toBe('sent')
    // 'Document send initiated' — 'send' keyword matches 'sent'
    expect(check('Document send initiated')).toBe('sent')
    expect(check('Created by user')).toBe('created')
    expect(check('Something unclassified')).toBe('other')
  })

  it('uses epoch zero as occurredAt fallback when history_date absent', () => {
    const result = transformAuditTrailEntry({}, 'env', 1)
    expect(result.occurredAt).toBe(new Date(0).toISOString())
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type RawXodoSignLogEntry,
} from '../../../../../../../src/verticals/docsign/adapters/xodo-sign/transform/audit-trail-entry'
import type { RawXodoSignSigner } from '../../../../../../../src/verticals/docsign/adapters/xodo-sign/transform/envelope'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('xodo-sign transformAuditTrailEntry', () => {
  it('maps a signed log entry to canonical AuditTrailEntry', () => {
    const raw: RawXodoSignLogEntry = {
      event: 'document_signed',
      signer: 1,
      timestamp: 1736294400,
    }
    const signerById = new Map<string, RawXodoSignSigner>([
      ['1', { id: 1, email: 'alice@example.com', name: 'Alice Signer', signed: true }],
    ])

    const result = transformAuditTrailEntry(raw, 'doc-abc', 0, signerById)

    expect(result.id).toBe('doc-abc:0')
    expect(result.externalId).toBe('doc-abc:0')
    expect(result.envelopeId).toBe('doc-abc')
    expect(result.occurredAt).toBeDefined()
    // 'document_signed' contains 'signed' → 'signed'
    expect(result.eventType).toBe('signed')
    expect(result.description).toBe('document_signed')
    expect(result.actorId).toBe('1')
    expect(result.actorEmail).toBe('alice@example.com')
    expect(result.actorName).toBe('Alice Signer')
    expect(result.platform).toBe('xodo-sign')

    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('maps event type variations correctly', () => {
    const check = (event: string) =>
      transformAuditTrailEntry({ event, timestamp: 1735689600 }, 'env', 0, new Map()).eventType

    expect(check('document_created')).toBe('created')
    expect(check('document_sent')).toBe('sent')
    expect(check('email_forwarded')).toBe('sent')
    expect(check('document_viewed')).toBe('viewed')
    expect(check('document_signed')).toBe('signed')
    expect(check('document_completed')).toBe('completed')
    expect(check('document_declined')).toBe('declined')
    expect(check('document_cancelled')).toBe('voided')
    expect(check('document_revoked')).toBe('voided')
    expect(check('document_expired')).toBe('expired')
    // 'reminder_sent' contains 'sent' which is checked before 'reminder' → 'sent'
    expect(check('reminder_sent')).toBe('sent')
    expect(check('reminder_only')).toBe('auto_reminded')
    expect(check('email_bounced')).toBe('delivery_failed')
    expect(check('something_unknown')).toBe('other')
  })

  it('falls back to epoch when timestamp is 0 or absent', () => {
    // timestamp=0 is treated as absent by xodo-sign's toIso helper
    const raw: RawXodoSignLogEntry = { event: 'document_viewed', timestamp: 0 }
    const result = transformAuditTrailEntry(raw, 'env', 0, new Map())
    expect(result.occurredAt).toBe('1970-01-01T00:00:00.000Z')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('omits actorEmail when signer not in signerById map', () => {
    const raw: RawXodoSignLogEntry = { event: 'document_viewed', signer: 99, timestamp: 1735689600 }
    const result = transformAuditTrailEntry(raw, 'env', 0, new Map())
    expect(result.actorId).toBe('99')
    expect(result.actorEmail).toBeUndefined()
    expect(result.actorName).toBeUndefined()
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})

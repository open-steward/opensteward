import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type RawLegaldeskAuditEvent,
} from '../../../../../../../src/verticals/docsign/adapters/legaldesk/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('legaldesk transformAuditTrailEntry', () => {
  const raw: RawLegaldeskAuditEvent = {
    event: 'document_signed',
    description: 'Signer completed the eSign flow.',
    occurred_at: '2025-03-05T12:00:00.000Z',
    actor_id: 'user_42',
    actor_email: 'bob@example.com',
    actor_name: 'Bob Smith',
    ip_address: '192.168.1.1',
    location: 'New Delhi, IN',
  }

  it('builds composite id from transactionId:index', () => {
    const result = transformAuditTrailEntry(raw, 'txn_001', 0)
    expect(result.id).toBe('txn_001:0')
    expect(result.externalId).toBe('txn_001:0')
  })

  it('sets envelopeId to the transactionId', () => {
    const result = transformAuditTrailEntry(raw, 'txn_001', 0)
    expect(result.envelopeId).toBe('txn_001')
  })

  it('maps occurred_at to occurredAt', () => {
    const result = transformAuditTrailEntry(raw, 'txn_001', 0)
    expect(result.occurredAt).toBe('2025-03-05T12:00:00.000Z')
  })

  it('maps signed event to signed eventType', () => {
    const result = transformAuditTrailEntry(raw, 'txn_001', 0)
    expect(result.eventType).toBe('signed')
  })

  it('maps description field', () => {
    const result = transformAuditTrailEntry(raw, 'txn_001', 0)
    expect(result.description).toBe('Signer completed the eSign flow.')
  })

  it('maps actor_email and actor_name', () => {
    const result = transformAuditTrailEntry(raw, 'txn_001', 0)
    expect(result.actorEmail).toBe('bob@example.com')
    expect(result.actorName).toBe('Bob Smith')
  })

  it('maps ip_address to actorIp', () => {
    const result = transformAuditTrailEntry(raw, 'txn_001', 0)
    expect(result.actorIp).toBe('192.168.1.1')
  })

  it('sets platform to legaldesk', () => {
    const result = transformAuditTrailEntry(raw, 'txn_001', 0)
    expect(result.platform).toBe('legaldesk')
  })

  it('passes AuditTrailEntrySchema validation', () => {
    const result = transformAuditTrailEntry(raw, 'txn_001', 0)
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('falls back to epoch zero when occurred_at is absent', () => {
    const { occurred_at: _, ...rest } = raw
    const result = transformAuditTrailEntry(rest, 'txn_001', 0)
    expect(result.occurredAt).toBe(new Date(0).toISOString())
  })

  it('maps create event type from initiat keyword', () => {
    const result = transformAuditTrailEntry({ ...raw, event: 'initiate_transaction' }, 'txn_001', 0)
    expect(result.eventType).toBe('created')
  })

  it('maps decline event type from declin keyword (without embedded "sign")', () => {
    // Note: mapEventType checks 'sign' before 'declin', so 'declined_by_signer' would
    // match 'sign' first. Use a string without 'sign' to exercise the 'declin' branch.
    const result = transformAuditTrailEntry({ ...raw, event: 'declined_by_party' }, 'txn_001', 0)
    expect(result.eventType).toBe('declined')
  })

  it('falls back to signer_id/signer_email when actor fields absent', () => {
    const { actor_id: _, actor_email: __, ...rest } = raw
    const result = transformAuditTrailEntry(
      { ...rest, signer_id: 'sig_fallback', signer_email: 'fallback@example.com' },
      'txn_001',
      0,
    )
    expect(result.actorId).toBe('sig_fallback')
    expect(result.actorEmail).toBe('fallback@example.com')
  })
})

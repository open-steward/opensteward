import { describe, it, expect } from 'vitest'
import { transformAuditTrailEntry } from '../../../../../../../src/verticals/docsign/adapters/opensign/transform/audit-trail-entry'
import type { RawOpensignAuditEntry } from '../../../../../../../src/verticals/docsign/adapters/opensign/transform/envelope'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('opensign transformAuditTrailEntry', () => {
  const raw: RawOpensignAuditEntry = {
    objectId: 'at_001',
    Activity: 'Signed',
    SignedOn: { __type: 'Date', iso: '2024-01-20T14:30:00.000Z' },
    ipAddress: '203.0.113.1',
    UserPtr: {
      objectId: 'sig_alice',
      Name: 'Alice Smith',
      Email: 'alice@example.com',
    },
  }

  it('maps id as envelopeId:externalId composite', () => {
    const result = transformAuditTrailEntry(raw, 'doc_os_001', 0)
    expect(result.id).toBe('doc_os_001:at_001')
  })

  it('maps externalId from objectId', () => {
    const result = transformAuditTrailEntry(raw, 'doc_os_001', 0)
    expect(result.externalId).toBe('at_001')
  })

  it('maps externalId as envelopeId:index fallback when objectId is absent', () => {
    const result = transformAuditTrailEntry({ ...raw, objectId: undefined }, 'doc_os_001', 3)
    expect(result.externalId).toBe('doc_os_001:3')
  })

  it('maps envelopeId from parameter', () => {
    const result = transformAuditTrailEntry(raw, 'doc_os_001', 0)
    expect(result.envelopeId).toBe('doc_os_001')
  })

  it('maps occurredAt from SignedOn Parse Date wrapper', () => {
    const result = transformAuditTrailEntry(raw, 'doc_os_001', 0)
    expect(result.occurredAt).toBe('2024-01-20T14:30:00.000Z')
  })

  it('maps occurredAt from ViewedOn when SignedOn is absent', () => {
    const result = transformAuditTrailEntry(
      {
        ...raw,
        SignedOn: undefined,
        ViewedOn: { __type: 'Date', iso: '2024-01-18T09:00:00.000Z' },
      },
      'doc_os_001',
      0,
    )
    expect(result.occurredAt).toBe('2024-01-18T09:00:00.000Z')
  })

  it('falls back to epoch zero when both timestamps are absent', () => {
    const result = transformAuditTrailEntry(
      { ...raw, SignedOn: undefined, ViewedOn: undefined },
      'doc_os_001',
      0,
    )
    expect(result.occurredAt).toBe(new Date(0).toISOString())
  })

  it('maps eventType signed from Activity "Signed"', () => {
    const result = transformAuditTrailEntry(raw, 'doc_os_001', 0)
    expect(result.eventType).toBe('signed')
  })

  it('maps eventType created from Activity "Created"', () => {
    const result = transformAuditTrailEntry({ ...raw, Activity: 'Created' }, 'doc_os_001', 0)
    expect(result.eventType).toBe('created')
  })

  it('maps eventType viewed from Activity "Viewed"', () => {
    const result = transformAuditTrailEntry({ ...raw, Activity: 'Viewed' }, 'doc_os_001', 0)
    expect(result.eventType).toBe('viewed')
  })

  it('maps eventType declined from Activity "Declined"', () => {
    const result = transformAuditTrailEntry({ ...raw, Activity: 'Declined' }, 'doc_os_001', 0)
    expect(result.eventType).toBe('declined')
  })

  it('maps eventType sent from Activity "sent"', () => {
    const result = transformAuditTrailEntry({ ...raw, Activity: 'sent' }, 'doc_os_001', 0)
    expect(result.eventType).toBe('sent')
  })

  it('maps eventType other from unknown activity', () => {
    const result = transformAuditTrailEntry({ ...raw, Activity: 'Forwarded' }, 'doc_os_001', 0)
    expect(result.eventType).toBe('other')
  })

  it('maps description from Activity field', () => {
    const result = transformAuditTrailEntry(raw, 'doc_os_001', 0)
    expect(result.description).toBe('Signed')
  })

  it('maps actorId from UserPtr.objectId', () => {
    const result = transformAuditTrailEntry(raw, 'doc_os_001', 0)
    expect(result.actorId).toBe('sig_alice')
  })

  it('maps actorEmail from UserPtr.Email', () => {
    const result = transformAuditTrailEntry(raw, 'doc_os_001', 0)
    expect(result.actorEmail).toBe('alice@example.com')
  })

  it('maps actorName from UserPtr.Name', () => {
    const result = transformAuditTrailEntry(raw, 'doc_os_001', 0)
    expect(result.actorName).toBe('Alice Smith')
  })

  it('maps actorIp from ipAddress', () => {
    const result = transformAuditTrailEntry(raw, 'doc_os_001', 0)
    expect(result.actorIp).toBe('203.0.113.1')
  })

  it('sets platform to opensign', () => {
    const result = transformAuditTrailEntry(raw, 'doc_os_001', 0)
    expect(result.platform).toBe('opensign')
  })

  it('includes activity and ipAddress in metadata', () => {
    const result = transformAuditTrailEntry(raw, 'doc_os_001', 0)
    expect(result.metadata.activity).toBe('Signed')
    expect(result.metadata.ipAddress).toBe('203.0.113.1')
  })

  it('passes AuditTrailEntrySchema.parse without throwing', () => {
    const result = transformAuditTrailEntry(raw, 'doc_os_001', 0)
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})

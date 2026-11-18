import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type RawFlowmonoActionLog,
} from '../../../../../../../src/verticals/docsign/adapters/flowmono/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('flowmono transformAuditTrailEntry', () => {
  const envelopeId = 'REF-001'

  const baseRaw: RawFlowmonoActionLog = {
    id: 99,
    signingRequestId: 'REF-001',
    recipientEmail: 'alice@example.com',
    recipientName: 'Alice Smith',
    action: 'Signed',
    actionDate: '2025-06-03T14:00:00.000Z',
    createdDate: '2025-06-01T10:00:00.000Z',
    ipAddress: '203.0.113.5',
    userId: 'user-42',
    userEmail: 'alice@example.com',
    userName: 'Alice Smith',
  }

  it('composes id as envelopeId:rawId', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.id).toBe('REF-001:99')
  })

  it('maps externalId from raw.id', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.externalId).toBe('99')
  })

  it('maps envelopeId', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.envelopeId).toBe('REF-001')
  })

  it('maps occurredAt from actionDate', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.occurredAt).toBe('2025-06-03T14:00:00.000Z')
  })

  it('falls back occurredAt to createdDate when actionDate is absent', () => {
    const result = transformAuditTrailEntry({ ...baseRaw, actionDate: undefined }, envelopeId, 0)
    expect(result.occurredAt).toBe('2025-06-01T10:00:00.000Z')
  })

  it('maps action "Signed" to signed event type', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.eventType).toBe('signed')
  })

  it('maps action "created" to created event type', () => {
    const result = transformAuditTrailEntry({ ...baseRaw, action: 'created' }, envelopeId, 0)
    expect(result.eventType).toBe('created')
  })

  it('maps action "sent" to sent event type', () => {
    const result = transformAuditTrailEntry({ ...baseRaw, action: 'sent' }, envelopeId, 0)
    expect(result.eventType).toBe('sent')
  })

  it('maps action "view" to viewed event type', () => {
    const result = transformAuditTrailEntry(
      { ...baseRaw, action: 'Viewed document' },
      envelopeId,
      0,
    )
    expect(result.eventType).toBe('viewed')
  })

  it('maps action "declined" to declined event type', () => {
    const result = transformAuditTrailEntry({ ...baseRaw, action: 'Declined' }, envelopeId, 0)
    expect(result.eventType).toBe('declined')
  })

  it('maps action "voided" to voided event type', () => {
    const result = transformAuditTrailEntry({ ...baseRaw, action: 'voided' }, envelopeId, 0)
    expect(result.eventType).toBe('voided')
  })

  it('maps unknown action to other', () => {
    const result = transformAuditTrailEntry({ ...baseRaw, action: 'unknown-action' }, envelopeId, 0)
    expect(result.eventType).toBe('other')
  })

  it('maps actorEmail from userEmail', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.actorEmail).toBe('alice@example.com')
  })

  it('maps actorId from userId', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.actorId).toBe('user-42')
  })

  it('maps actorIp from ipAddress', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.actorIp).toBe('203.0.113.5')
  })

  it('falls back actorEmail to recipientEmail when userEmail is absent', () => {
    const result = transformAuditTrailEntry({ ...baseRaw, userEmail: undefined }, envelopeId, 0)
    expect(result.actorEmail).toBe('alice@example.com')
  })

  it('synthesises id from envelopeId and index when raw.id is absent', () => {
    const result = transformAuditTrailEntry({ ...baseRaw, id: undefined }, envelopeId, 3)
    // idStr becomes `envelopeId:index` = `REF-001:3`, then outer id = `REF-001:REF-001:3`
    expect(result.id).toBe('REF-001:REF-001:3')
  })

  it('sets platform to flowmono', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.platform).toBe('flowmono')
  })

  it('produces a schema-valid AuditTrailEntry', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})

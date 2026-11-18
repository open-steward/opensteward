import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type RawFptEcontractHistoryEvent,
} from '../../../../../../../src/verticals/docsign/adapters/fpt-econtract/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('fpt-econtract transformAuditTrailEntry', () => {
  const envelopeId = 'CTR-001'

  const baseRaw: RawFptEcontractHistoryEvent = {
    id: 'evt-1',
    action: 'signed',
    description: 'Contract signed by recipient',
    createdAt: '2025-04-02T11:00:00.000Z',
    actorId: 'user-10',
    actorEmail: 'signer@example.com',
    actorName: 'Bob Signer',
    ipAddress: '192.168.1.1',
  }

  it('composes id as envelopeId:index', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.id).toBe('CTR-001:0')
  })

  it('maps externalId from raw.id', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.externalId).toBe('evt-1')
  })

  it('maps envelopeId', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.envelopeId).toBe('CTR-001')
  })

  it('maps createdAt to occurredAt', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.occurredAt).toBe('2025-04-02T11:00:00.000Z')
  })

  it('maps action "signed" to signed event type', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.eventType).toBe('signed')
  })

  it('maps action "create" to created event type', () => {
    const result = transformAuditTrailEntry({ ...baseRaw, action: 'create' }, envelopeId, 0)
    expect(result.eventType).toBe('created')
  })

  it('maps action "sent" to sent event type', () => {
    const result = transformAuditTrailEntry({ ...baseRaw, action: 'sent' }, envelopeId, 0)
    expect(result.eventType).toBe('sent')
  })

  it('maps action "view" to viewed event type', () => {
    const result = transformAuditTrailEntry({ ...baseRaw, action: 'view' }, envelopeId, 0)
    expect(result.eventType).toBe('viewed')
  })

  it('maps action "reject" to declined event type', () => {
    const result = transformAuditTrailEntry({ ...baseRaw, action: 'reject' }, envelopeId, 0)
    expect(result.eventType).toBe('declined')
  })

  it('maps action "cancel" to voided event type', () => {
    const result = transformAuditTrailEntry({ ...baseRaw, action: 'cancel' }, envelopeId, 0)
    expect(result.eventType).toBe('voided')
  })

  it('maps action "completed" to completed event type', () => {
    const result = transformAuditTrailEntry({ ...baseRaw, action: 'completed' }, envelopeId, 0)
    expect(result.eventType).toBe('completed')
  })

  it('maps action "expire" to expired event type', () => {
    const result = transformAuditTrailEntry({ ...baseRaw, action: 'expire' }, envelopeId, 0)
    expect(result.eventType).toBe('expired')
  })

  it('maps unknown action to other', () => {
    const result = transformAuditTrailEntry({ ...baseRaw, action: 'unknown' }, envelopeId, 0)
    expect(result.eventType).toBe('other')
  })

  it('maps description from raw.description', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.description).toBe('Contract signed by recipient')
  })

  it('maps actorId', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.actorId).toBe('user-10')
  })

  it('maps actorEmail', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.actorEmail).toBe('signer@example.com')
  })

  it('maps actorName', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.actorName).toBe('Bob Signer')
  })

  it('maps actorIp from ipAddress', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.actorIp).toBe('192.168.1.1')
  })

  it('falls back actorIp to raw.ip when ipAddress absent', () => {
    const result = transformAuditTrailEntry(
      { ...baseRaw, ipAddress: undefined, ip: '10.0.0.1' },
      envelopeId,
      0,
    )
    expect(result.actorIp).toBe('10.0.0.1')
  })

  it('falls back occurredAt to epoch when no timestamp present', () => {
    const result = transformAuditTrailEntry(
      {
        ...baseRaw,
        createdAt: undefined,
        createdDate: undefined,
        time: undefined,
        timestamp: undefined,
      },
      envelopeId,
      0,
    )
    expect(result.occurredAt).toBe(new Date(0).toISOString())
  })

  it('falls back action to raw.event when raw.action absent', () => {
    const result = transformAuditTrailEntry(
      { ...baseRaw, action: undefined, event: 'sign' },
      envelopeId,
      0,
    )
    expect(result.eventType).toBe('signed')
  })

  it('sets platform to fpt-econtract', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.platform).toBe('fpt-econtract')
  })

  it('produces a schema-valid AuditTrailEntry', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type RawSignorityHistory,
} from '../../../../../../../src/verticals/docsign/adapters/signority/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

const ENVELOPE_ID = 'env-55'

describe('signority transformAuditTrailEntry', () => {
  it('composes id as envelopeId:index', () => {
    const raw: RawSignorityHistory = {
      id: 'hist-1',
      action: 'Document created by sender',
      dateTime: 1705312800000,
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.id).toBe('env-55:0')
  })

  it('uses raw.id as externalId when present', () => {
    const raw: RawSignorityHistory = {
      id: 'hist-1',
      action: 'Document signed by Alice',
      dateTime: 1708000000000,
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.externalId).toBe('hist-1')
  })

  it('falls back to envelopeId:index for externalId when id absent', () => {
    const raw: RawSignorityHistory = {
      action: 'Document created',
      dateTime: 1705312800000,
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 2)
    expect(result.externalId).toBe('env-55:2')
  })

  it('maps envelopeId', () => {
    const raw: RawSignorityHistory = { action: 'Document signed', dateTime: 1708000000000 }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.envelopeId).toBe(ENVELOPE_ID)
  })

  it('maps dateTime epoch millis to occurredAt ISO', () => {
    const raw: RawSignorityHistory = {
      id: 'hist-1',
      action: 'Document created',
      dateTime: 1705312800000,
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.occurredAt).toBe(new Date(1705312800000).toISOString())
  })

  it('maps "Document created by sender" to eventType created', () => {
    const raw: RawSignorityHistory = {
      action: 'Document created by sender',
      dateTime: 1705312800000,
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.eventType).toBe('created')
  })

  it('maps "Document signed by Alice" to eventType signed', () => {
    const raw: RawSignorityHistory = {
      action: 'Document signed by Alice',
      dateTime: 1708000000000,
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.eventType).toBe('signed')
  })

  it('maps "Document sent to signers" to eventType sent', () => {
    const raw: RawSignorityHistory = {
      action: 'Document sent to signers',
      dateTime: 1705400000000,
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.eventType).toBe('sent')
  })

  it('maps "Document viewed" to eventType viewed', () => {
    const raw: RawSignorityHistory = {
      action: 'Document viewed by Bob',
      dateTime: 1705600000000,
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.eventType).toBe('viewed')
  })

  it('maps "Document declined" to eventType declined', () => {
    const raw: RawSignorityHistory = {
      action: 'Document declined by signer',
      dateTime: 1706000000000,
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.eventType).toBe('declined')
  })

  it('maps unrecognised action to other', () => {
    const raw: RawSignorityHistory = {
      action: 'Something obscure happened',
      dateTime: 1705312800000,
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.eventType).toBe('other')
  })

  it('maps actor name, email, ip', () => {
    const raw: RawSignorityHistory = {
      action: 'Document signed by Alice',
      dateTime: 1708000000000,
      name: 'Alice Doe',
      email: 'alice@example.com',
      ip: '203.0.113.10',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.actorName).toBe('Alice Doe')
    expect(result.actorEmail).toBe('alice@example.com')
    expect(result.actorIp).toBe('203.0.113.10')
  })

  it('maps action as description', () => {
    const raw: RawSignorityHistory = {
      action: 'Document created by sender',
      dateTime: 1705312800000,
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.description).toBe('Document created by sender')
  })

  it('sets platform to signority', () => {
    const raw: RawSignorityHistory = { action: 'Document created', dateTime: 1705312800000 }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.platform).toBe('signority')
  })

  it('passes AuditTrailEntrySchema.parse without throwing', () => {
    const raw: RawSignorityHistory = {
      id: 'hist-1',
      documentID: 55,
      action: 'Document signed by Alice',
      actionId: 10,
      dateTime: 1708000000000,
      name: 'Alice Doe',
      email: 'alice@example.com',
      ip: '203.0.113.10',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})

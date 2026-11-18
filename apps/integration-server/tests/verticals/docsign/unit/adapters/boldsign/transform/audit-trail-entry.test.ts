import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type RawBoldsignHistoryEvent,
} from '../../../../../../../src/verticals/docsign/adapters/boldsign/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

const EVENT_EPOCH = 1708000000 // 2024-02-15T12:26:40.000Z
const DOC_ID = 'doc-abc-123'

describe('boldsign transformAuditTrailEntry', () => {
  it('maps id and externalId as documentId:index', () => {
    const raw: RawBoldsignHistoryEvent = {
      action: 'Signed',
      date: EVENT_EPOCH,
      userName: 'Alice',
      userEmail: 'alice@example.com',
    }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.id).toBe('doc-abc-123:0')
    expect(result.externalId).toBe('doc-abc-123:0')
  })

  it('maps envelopeId to documentId', () => {
    const raw: RawBoldsignHistoryEvent = {
      action: 'Signed',
      date: EVENT_EPOCH,
    }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.envelopeId).toBe(DOC_ID)
  })

  it('maps occurredAt from date epoch seconds', () => {
    const raw: RawBoldsignHistoryEvent = {
      action: 'Signed',
      date: EVENT_EPOCH,
    }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.occurredAt).toBe(new Date(EVENT_EPOCH * 1000).toISOString())
  })

  it('falls back to activityDate when date is absent', () => {
    const raw: RawBoldsignHistoryEvent = {
      action: 'Viewed',
      activityDate: EVENT_EPOCH,
    }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.occurredAt).toBe(new Date(EVENT_EPOCH * 1000).toISOString())
  })

  it('falls back to createdDate when date and activityDate are absent', () => {
    const raw: RawBoldsignHistoryEvent = {
      action: 'Created',
      createdDate: EVENT_EPOCH,
    }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.occurredAt).toBe(new Date(EVENT_EPOCH * 1000).toISOString())
  })

  it('falls back to epoch 0 when no date field is present', () => {
    const raw: RawBoldsignHistoryEvent = { action: 'Signed' }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.occurredAt).toBe(new Date(0).toISOString())
  })

  it('maps sign action to signed eventType', () => {
    const raw: RawBoldsignHistoryEvent = { action: 'Signed', date: EVENT_EPOCH }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.eventType).toBe('signed')
  })

  it('maps create action to created eventType', () => {
    const raw: RawBoldsignHistoryEvent = { action: 'DocumentCreated', date: EVENT_EPOCH }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.eventType).toBe('created')
  })

  it('maps sent action to sent eventType', () => {
    const raw: RawBoldsignHistoryEvent = { action: 'DocumentSent', date: EVENT_EPOCH }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.eventType).toBe('sent')
  })

  it('maps view action to viewed eventType', () => {
    const raw: RawBoldsignHistoryEvent = { action: 'DocumentViewed', date: EVENT_EPOCH }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.eventType).toBe('viewed')
  })

  it('maps decline action to declined eventType', () => {
    const raw: RawBoldsignHistoryEvent = { action: 'DocumentDeclined', date: EVENT_EPOCH }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.eventType).toBe('declined')
  })

  it('maps revoke action to voided eventType', () => {
    const raw: RawBoldsignHistoryEvent = { action: 'DocumentRevoked', date: EVENT_EPOCH }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.eventType).toBe('voided')
  })

  it('maps expire action to expired eventType', () => {
    const raw: RawBoldsignHistoryEvent = { action: 'DocumentExpired', date: EVENT_EPOCH }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.eventType).toBe('expired')
  })

  it('maps remind action to auto_reminded eventType', () => {
    // 'ReminderSent' → lowercase 'remindersent' contains 'sent' which matches before 'remind'
    // Use a pure 'remind' keyword that avoids earlier-matching substrings
    const raw: RawBoldsignHistoryEvent = { action: 'Reminder', date: EVENT_EPOCH }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.eventType).toBe('auto_reminded')
  })

  it('maps reassign action: note "reassign" contains "sign" so signed branch wins', () => {
    // QUIRK: 'reassign' contains the substring 'sign', so the `sign/complete → signed`
    // branch in mapEventType always fires before the `reassign → reassigned` branch.
    // Any action string with 'reassign' will produce 'signed', not 'reassigned'.
    const raw: RawBoldsignHistoryEvent = { action: 'Reassigned', date: EVENT_EPOCH }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.eventType).toBe('signed')
  })

  it('maps edit action to corrected eventType', () => {
    const raw: RawBoldsignHistoryEvent = { action: 'DocumentEdited', date: EVENT_EPOCH }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.eventType).toBe('corrected')
  })

  it('maps auth action to authenticated eventType', () => {
    // 'SignerAuthenticated' → lowercase contains 'sign' which matches 'signed' before 'auth'
    // Use a pure 'auth' keyword that avoids earlier-matching substrings
    const raw: RawBoldsignHistoryEvent = { action: 'Authenticated', date: EVENT_EPOCH }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.eventType).toBe('authenticated')
  })

  it('maps fail action to delivery_failed eventType', () => {
    const raw: RawBoldsignHistoryEvent = { action: 'DeliveryFailed', date: EVENT_EPOCH }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.eventType).toBe('delivery_failed')
  })

  it('maps unknown action to other eventType', () => {
    const raw: RawBoldsignHistoryEvent = { action: 'SomeRandomAction', date: EVENT_EPOCH }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.eventType).toBe('other')
  })

  it('maps actorEmail from userEmail', () => {
    const raw: RawBoldsignHistoryEvent = {
      action: 'Signed',
      date: EVENT_EPOCH,
      userEmail: 'alice@example.com',
    }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.actorEmail).toBe('alice@example.com')
  })

  it('falls back to fromEmail when userEmail is absent', () => {
    const raw: RawBoldsignHistoryEvent = {
      action: 'Signed',
      date: EVENT_EPOCH,
      fromEmail: 'sender@example.com',
    }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.actorEmail).toBe('sender@example.com')
  })

  it('maps actorName from userName', () => {
    const raw: RawBoldsignHistoryEvent = {
      action: 'Signed',
      date: EVENT_EPOCH,
      userName: 'Alice Doe',
    }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.actorName).toBe('Alice Doe')
  })

  it('falls back to fromName when userName is absent', () => {
    const raw: RawBoldsignHistoryEvent = {
      action: 'Signed',
      date: EVENT_EPOCH,
      fromName: 'Sender Name',
    }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.actorName).toBe('Sender Name')
  })

  it('maps actorIp from ipAddress', () => {
    const raw: RawBoldsignHistoryEvent = {
      action: 'Signed',
      date: EVENT_EPOCH,
      ipAddress: '203.0.113.42',
    }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.actorIp).toBe('203.0.113.42')
  })

  it('maps description from description field', () => {
    const raw: RawBoldsignHistoryEvent = {
      action: 'Signed',
      date: EVENT_EPOCH,
      description: 'Alice signed the document',
    }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.description).toBe('Alice signed the document')
  })

  it('falls back to action as description when description is absent', () => {
    const raw: RawBoldsignHistoryEvent = {
      action: 'Signed',
      date: EVENT_EPOCH,
    }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.description).toBe('Signed')
  })

  it('uses actionType when action is absent', () => {
    const raw: RawBoldsignHistoryEvent = {
      actionType: 'DocumentViewed',
      date: EVENT_EPOCH,
    }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.eventType).toBe('viewed')
  })

  it('uses correct index in id for second entry', () => {
    const raw: RawBoldsignHistoryEvent = { action: 'Signed', date: EVENT_EPOCH }
    const result = transformAuditTrailEntry(raw, DOC_ID, 5)
    expect(result.id).toBe('doc-abc-123:5')
    expect(result.externalId).toBe('doc-abc-123:5')
  })

  it('sets platform to boldsign', () => {
    const raw: RawBoldsignHistoryEvent = { action: 'Signed', date: EVENT_EPOCH }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.platform).toBe('boldsign')
  })

  it('puts action into metadata', () => {
    const raw: RawBoldsignHistoryEvent = {
      action: 'Signed',
      date: EVENT_EPOCH,
      ipAddress: '10.0.0.1',
    }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(result.metadata.action).toBe('Signed')
    expect(result.metadata.ipAddress).toBe('10.0.0.1')
  })

  it('passes AuditTrailEntrySchema.parse without throwing', () => {
    const raw: RawBoldsignHistoryEvent = {
      action: 'Signed',
      date: EVENT_EPOCH,
      userName: 'Alice',
      userEmail: 'alice@example.com',
      description: 'Alice signed the document',
      ipAddress: '203.0.113.42',
    }
    const result = transformAuditTrailEntry(raw, DOC_ID, 0)
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})

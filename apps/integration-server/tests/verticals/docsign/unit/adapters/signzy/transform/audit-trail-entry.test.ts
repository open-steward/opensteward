import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  mapNotificationEvent,
  type SyntheticAuditEvent,
} from '../../../../../../../src/verticals/docsign/adapters/signzy/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

const ENVELOPE_ID = 'ctr-xyz-123'

describe('signzy mapNotificationEvent', () => {
  it('maps sendsigninglink to sent', () => {
    expect(mapNotificationEvent('sendsigninglink')).toBe('sent')
  })

  it('maps sendreminder to auto_reminded', () => {
    expect(mapNotificationEvent('sendreminder')).toBe('auto_reminded')
  })

  it('maps sendconfirmation to completed', () => {
    expect(mapNotificationEvent('sendconfirmation')).toBe('completed')
  })

  it('maps sendaudit to other', () => {
    expect(mapNotificationEvent('sendaudit')).toBe('other')
  })

  it('maps sendotp to authenticated', () => {
    expect(mapNotificationEvent('sendotp')).toBe('authenticated')
  })

  it('maps sendreviewer to sent', () => {
    expect(mapNotificationEvent('sendreviewer')).toBe('sent')
  })

  it('maps unknown event to other', () => {
    expect(mapNotificationEvent('unknownxyz')).toBe('other')
  })
})

describe('signzy transformAuditTrailEntry', () => {
  it('composes id as envelopeId:index', () => {
    const e: SyntheticAuditEvent = {
      envelopeId: ENVELOPE_ID,
      occurredAt: '2024-01-15T10:00:00.000Z',
      type: 'sent',
      description: 'Signing link sent',
      signerId: 'signer-001',
    }
    const result = transformAuditTrailEntry(e, 0)
    expect(result.id).toBe('ctr-xyz-123:0')
  })

  it('uses notificationId as externalId when present', () => {
    const e: SyntheticAuditEvent = {
      envelopeId: ENVELOPE_ID,
      occurredAt: '2024-01-15T10:00:00.000Z',
      type: 'sent',
      description: 'Signing link sent',
      notificationId: 'notif-abc',
    }
    const result = transformAuditTrailEntry(e, 0)
    expect(result.externalId).toBe('notif-abc')
  })

  it('falls back to envelopeId:index for externalId when notificationId absent', () => {
    const e: SyntheticAuditEvent = {
      envelopeId: ENVELOPE_ID,
      occurredAt: '2024-01-15T10:00:00.000Z',
      type: 'sent',
      description: 'Signing link sent',
    }
    const result = transformAuditTrailEntry(e, 2)
    expect(result.externalId).toBe('ctr-xyz-123:2')
  })

  it('maps envelopeId', () => {
    const e: SyntheticAuditEvent = {
      envelopeId: ENVELOPE_ID,
      occurredAt: '2024-02-01T14:20:00.000Z',
      type: 'signed',
      description: 'Signed',
    }
    const result = transformAuditTrailEntry(e, 0)
    expect(result.envelopeId).toBe(ENVELOPE_ID)
  })

  it('maps occurredAt ISO string', () => {
    const e: SyntheticAuditEvent = {
      envelopeId: ENVELOPE_ID,
      occurredAt: '2024-02-01T14:20:00.000Z',
      type: 'signed',
      description: 'Signed',
    }
    const result = transformAuditTrailEntry(e, 0)
    expect(result.occurredAt).toBe('2024-02-01T14:20:00.000Z')
  })

  it('falls back to epoch 0 ISO when occurredAt absent', () => {
    const e: SyntheticAuditEvent = {
      envelopeId: ENVELOPE_ID,
      type: 'other',
      description: 'Unknown event',
    }
    const result = transformAuditTrailEntry(e, 0)
    expect(result.occurredAt).toBe(new Date(0).toISOString())
  })

  it('maps type to eventType', () => {
    const e: SyntheticAuditEvent = {
      envelopeId: ENVELOPE_ID,
      occurredAt: '2024-02-01T14:20:00.000Z',
      type: 'signed',
      description: 'Signer completed',
    }
    const result = transformAuditTrailEntry(e, 0)
    expect(result.eventType).toBe('signed')
  })

  it('maps description', () => {
    const e: SyntheticAuditEvent = {
      envelopeId: ENVELOPE_ID,
      occurredAt: '2024-01-15T10:00:00.000Z',
      type: 'sent',
      description: 'Signing link dispatched',
    }
    const result = transformAuditTrailEntry(e, 0)
    expect(result.description).toBe('Signing link dispatched')
  })

  it('maps actor fields from event', () => {
    const e: SyntheticAuditEvent = {
      envelopeId: ENVELOPE_ID,
      occurredAt: '2024-02-01T14:20:00.000Z',
      type: 'signed',
      description: 'Signed',
      signerId: 'signer-001',
      signerName: 'Alice Doe',
      signerIp: '203.0.113.10',
    }
    const result = transformAuditTrailEntry(e, 0)
    expect(result.actorId).toBe('signer-001')
    expect(result.actorName).toBe('Alice Doe')
    expect(result.actorIp).toBe('203.0.113.10')
  })

  it('sets platform to signzy', () => {
    const e: SyntheticAuditEvent = {
      envelopeId: ENVELOPE_ID,
      occurredAt: '2024-01-15T10:00:00.000Z',
      type: 'sent',
      description: 'Sent',
    }
    const result = transformAuditTrailEntry(e, 0)
    expect(result.platform).toBe('signzy')
  })

  it('puts channel and status into metadata', () => {
    const e: SyntheticAuditEvent = {
      envelopeId: ENVELOPE_ID,
      occurredAt: '2024-01-15T10:00:00.000Z',
      type: 'sent',
      description: 'SMS sent',
      channel: 'sms',
      status: 'delivered',
    }
    const result = transformAuditTrailEntry(e, 0)
    expect(result.metadata.channel).toBe('sms')
    expect(result.metadata.status).toBe('delivered')
  })

  it('passes AuditTrailEntrySchema.parse without throwing', () => {
    const e: SyntheticAuditEvent = {
      envelopeId: ENVELOPE_ID,
      occurredAt: '2024-02-01T14:20:00.000Z',
      type: 'signed',
      description: 'Signer completed',
      signerId: 'signer-001',
      signerName: 'Alice Doe',
      signerIp: '203.0.113.10',
      notificationId: 'notif-abc',
      channel: 'email',
      event: 'sendconfirmation',
      status: 'success',
    }
    const result = transformAuditTrailEntry(e, 0)
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})

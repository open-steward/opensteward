import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type RawSirionActivity,
} from '../../../../../../../src/verticals/docsign/adapters/sirion/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

const ENVELOPE_ID = 'ctr-sirion-1'

describe('sirion transformAuditTrailEntry', () => {
  it('composes id and externalId as envelopeId:index', () => {
    const raw: RawSirionActivity = {
      activityType: 'CONTRACT_CREATED',
      performedOn: '2024-01-15T09:30:00.000Z',
      description: 'Contract created',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.id).toBe('ctr-sirion-1:0')
    expect(result.externalId).toBe('ctr-sirion-1:0')
  })

  it('maps envelopeId', () => {
    const raw: RawSirionActivity = {
      activityType: 'CONTRACT_CREATED',
      performedOn: '2024-01-15T09:30:00.000Z',
      description: 'Contract created',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.envelopeId).toBe(ENVELOPE_ID)
  })

  it('maps performedOn to occurredAt', () => {
    const raw: RawSirionActivity = {
      activityType: 'CONTRACT_SENT',
      performedOn: '2024-01-15T10:00:00.000Z',
      description: 'Sent for signature',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.occurredAt).toBe('2024-01-15T10:00:00.000Z')
  })

  it('falls back to timestamp when performedOn absent', () => {
    const raw: RawSirionActivity = {
      activityType: 'CONTRACT_SENT',
      timestamp: '2024-01-15T10:00:00.000Z',
      description: 'Sent',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.occurredAt).toBe('2024-01-15T10:00:00.000Z')
  })

  it('falls back to epoch 0 when no date present', () => {
    const raw: RawSirionActivity = {
      activityType: 'UNKNOWN',
      description: 'Unknown event',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.occurredAt).toBe(new Date(0).toISOString())
  })

  it('maps activityType containing "create" to created', () => {
    const raw: RawSirionActivity = {
      activityType: 'CONTRACT_CREATED',
      performedOn: '2024-01-15T09:30:00.000Z',
      description: 'Contract authored',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.eventType).toBe('created')
  })

  it('maps activityType containing "sign" to signed', () => {
    const raw: RawSirionActivity = {
      activityType: 'CONTRACT_SIGNED',
      performedOn: '2024-02-01T14:20:00.000Z',
      description: 'Signatory signed',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.eventType).toBe('signed')
  })

  it('maps activityType containing "sent" (without "sign") to sent', () => {
    // "sign" matches before "sent" in mapEvent, so use an activity name
    // with "sent" but not "sign" to exercise the sent branch.
    const raw: RawSirionActivity = {
      activityType: 'OUT_FOR_REVIEW_SENT',
      performedOn: '2024-01-15T10:00:00.000Z',
      description: 'Sent out for review',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.eventType).toBe('sent')
  })

  it('maps activityType containing "terminate" to voided', () => {
    const raw: RawSirionActivity = {
      activityType: 'CONTRACT_TERMINATED',
      performedOn: '2024-01-25T11:00:00.000Z',
      description: 'Contract terminated',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.eventType).toBe('voided')
  })

  it('maps activityType containing "execute" to completed', () => {
    const raw: RawSirionActivity = {
      activityType: 'CONTRACT_EXECUTED',
      performedOn: '2024-02-05T16:00:00.000Z',
      description: 'Contract fully executed',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.eventType).toBe('completed')
  })

  it('maps activityType containing "decline" (without "sign") to declined', () => {
    // mapEvent checks "sign" before "decline", so use a name that has
    // "decline" but not "sign" to exercise the declined branch.
    const raw: RawSirionActivity = {
      activityType: 'CONTRACT_DECLINED',
      performedOn: '2024-01-20T09:00:00.000Z',
      description: 'Contract was declined',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.eventType).toBe('declined')
  })

  it('maps activityType containing "modif" to corrected', () => {
    const raw: RawSirionActivity = {
      activityType: 'CONTRACT_MODIFIED',
      performedOn: '2024-01-18T13:00:00.000Z',
      description: 'Contract modified',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.eventType).toBe('corrected')
  })

  it('maps unknown activityType to other', () => {
    const raw: RawSirionActivity = {
      activityType: 'SOMETHING_UNRECOGNISED',
      performedOn: '2024-01-15T09:30:00.000Z',
      description: 'An event',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.eventType).toBe('other')
  })

  it('prefers description field over comment', () => {
    const raw: RawSirionActivity = {
      activityType: 'CONTRACT_CREATED',
      performedOn: '2024-01-15T09:30:00.000Z',
      description: 'Primary description',
      comment: 'Secondary comment',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.description).toBe('Primary description')
  })

  it('falls back to comment when description absent', () => {
    const raw: RawSirionActivity = {
      activityType: 'CONTRACT_SIGNED',
      performedOn: '2024-02-01T14:20:00.000Z',
      comment: 'Signer note',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.description).toBe('Signer note')
  })

  it('maps actor fields from performedBy', () => {
    const raw: RawSirionActivity = {
      activityType: 'CONTRACT_SIGNED',
      performedOn: '2024-02-01T14:20:00.000Z',
      description: 'Signed',
      performedBy: {
        userId: 'usr-alice',
        emailId: 'alice@example.com',
        displayName: 'Alice Doe',
      },
      ipAddress: '203.0.113.10',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.actorId).toBe('usr-alice')
    expect(result.actorEmail).toBe('alice@example.com')
    expect(result.actorName).toBe('Alice Doe')
    expect(result.actorIp).toBe('203.0.113.10')
  })

  it('sets platform to sirion', () => {
    const raw: RawSirionActivity = {
      activityType: 'CONTRACT_CREATED',
      performedOn: '2024-01-15T09:30:00.000Z',
      description: 'Created',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.platform).toBe('sirion')
  })

  it('puts activityType into metadata', () => {
    const raw: RawSirionActivity = {
      activityType: 'CONTRACT_SIGNED',
      performedOn: '2024-02-01T14:20:00.000Z',
      description: 'Signed',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(result.metadata.activityType).toBe('CONTRACT_SIGNED')
  })

  it('passes AuditTrailEntrySchema.parse without throwing', () => {
    const raw: RawSirionActivity = {
      activityType: 'CONTRACT_SIGNED',
      performedOn: '2024-02-01T14:20:00.000Z',
      description: 'Signer completed execution',
      performedBy: {
        userId: 'usr-alice',
        emailId: 'alice@example.com',
        displayName: 'Alice Doe',
      },
      ipAddress: '203.0.113.10',
    }
    const result = transformAuditTrailEntry(raw, ENVELOPE_ID, 0)
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})

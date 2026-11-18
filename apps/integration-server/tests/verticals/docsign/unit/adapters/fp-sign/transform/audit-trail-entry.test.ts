import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type RawFpSignTraceLogEntry,
} from '../../../../../../../src/verticals/docsign/adapters/fp-sign/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('fp-sign transformAuditTrailEntry', () => {
  const envelopeId = '123'

  const baseRaw: RawFpSignTraceLogEntry = {
    domain: 'workflow',
    dateCreated: '2025-05-17T12:00:00.000Z',
    message: 'Document signed by user',
    initiator: 'signer@example.com',
    target: '123',
  }

  it('synthesises id from envelopeId, timestamp and index', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.id).toBe(`audit:123:2025-05-17T12:00:00.000Z:0`)
  })

  it('maps externalId equal to id', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.externalId).toBe(result.id)
  })

  it('maps envelopeId', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.envelopeId).toBe('123')
  })

  it('maps dateCreated to occurredAt', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.occurredAt).toBe('2025-05-17T12:00:00.000Z')
  })

  it('maps "signed" keyword in message to signed event type', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.eventType).toBe('signed')
  })

  it('maps "created" keyword in message to created event type', () => {
    const result = transformAuditTrailEntry(
      { ...baseRaw, message: 'Workflow created' },
      envelopeId,
      0,
    )
    expect(result.eventType).toBe('created')
  })

  it('maps "sent" keyword to sent event type', () => {
    const result = transformAuditTrailEntry(
      { ...baseRaw, message: 'Document sent to signers' },
      envelopeId,
      0,
    )
    expect(result.eventType).toBe('sent')
  })

  it('maps "completed" keyword to completed event type', () => {
    const result = transformAuditTrailEntry(
      { ...baseRaw, message: 'Workflow completed' },
      envelopeId,
      0,
    )
    expect(result.eventType).toBe('completed')
  })

  it('maps "rejected" keyword to declined event type', () => {
    // NOTE: "Signature rejected" would hit the 'signed' branch first because
    // the mapper checks msg.includes('signature') before msg.includes('rejected').
    // Use a message that only triggers the declined branch.
    const result = transformAuditTrailEntry(
      { ...baseRaw, message: 'Action rejected by recipient' },
      envelopeId,
      0,
    )
    expect(result.eventType).toBe('declined')
  })

  it('maps "cancelled" keyword to voided event type', () => {
    const result = transformAuditTrailEntry(
      { ...baseRaw, message: 'Workflow cancelled by user' },
      envelopeId,
      0,
    )
    expect(result.eventType).toBe('voided')
  })

  it('maps initiator email to actorEmail', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.actorEmail).toBe('signer@example.com')
  })

  it('maps non-email initiator to actorId', () => {
    const result = transformAuditTrailEntry({ ...baseRaw, initiator: 'user-id-999' }, envelopeId, 0)
    expect(result.actorId).toBe('user-id-999')
    expect(result.actorEmail).toBeUndefined()
  })

  it('maps message to description', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.description).toBe('Document signed by user')
  })

  it('falls back occurredAt to epoch when dateCreated absent', () => {
    const result = transformAuditTrailEntry({ ...baseRaw, dateCreated: undefined }, envelopeId, 0)
    expect(result.occurredAt).toBe(new Date(0).toISOString())
  })

  it('sets platform to fp-sign', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(result.platform).toBe('fp-sign')
  })

  it('produces a schema-valid AuditTrailEntry', () => {
    const result = transformAuditTrailEntry(baseRaw, envelopeId, 0)
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})

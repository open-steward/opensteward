import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type SyntheticAuditEvent,
} from '../../../../../../../src/verticals/docsign/adapters/libresign/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('libresign transformAuditTrailEntry', () => {
  const event: SyntheticAuditEvent = {
    envelopeId: 'file-uuid-003',
    occurredAt: '2025-06-03T14:00:00.000Z',
    type: 'signed',
    description: 'Signer carol@example.com signed the document.',
    actorId: 'carol_user',
    actorEmail: 'carol@example.com',
    actorName: 'Carol Smith',
    actorIp: '10.0.0.5',
    extra: { signatureMethod: 'email' },
  }

  it('builds composite id from envelopeId:index', () => {
    const result = transformAuditTrailEntry(event, 0)
    expect(result.id).toBe('file-uuid-003:0')
    expect(result.externalId).toBe('file-uuid-003:0')
  })

  it('sets envelopeId to event.envelopeId', () => {
    const result = transformAuditTrailEntry(event, 0)
    expect(result.envelopeId).toBe('file-uuid-003')
  })

  it('passes occurredAt through unchanged', () => {
    const result = transformAuditTrailEntry(event, 0)
    expect(result.occurredAt).toBe('2025-06-03T14:00:00.000Z')
  })

  it('maps event type to eventType', () => {
    const result = transformAuditTrailEntry(event, 0)
    expect(result.eventType).toBe('signed')
  })

  it('maps description to description', () => {
    const result = transformAuditTrailEntry(event, 0)
    expect(result.description).toBe('Signer carol@example.com signed the document.')
  })

  it('maps actorId to actorId', () => {
    const result = transformAuditTrailEntry(event, 0)
    expect(result.actorId).toBe('carol_user')
  })

  it('maps actorEmail to actorEmail', () => {
    const result = transformAuditTrailEntry(event, 0)
    expect(result.actorEmail).toBe('carol@example.com')
  })

  it('maps actorName to actorName', () => {
    const result = transformAuditTrailEntry(event, 0)
    expect(result.actorName).toBe('Carol Smith')
  })

  it('maps actorIp to actorIp', () => {
    const result = transformAuditTrailEntry(event, 0)
    expect(result.actorIp).toBe('10.0.0.5')
  })

  it('sets platform to libresign', () => {
    const result = transformAuditTrailEntry(event, 0)
    expect(result.platform).toBe('libresign')
  })

  it('uses index in id (increments per entry)', () => {
    const result1 = transformAuditTrailEntry(event, 0)
    const result2 = transformAuditTrailEntry(event, 1)
    expect(result1.id).toBe('file-uuid-003:0')
    expect(result2.id).toBe('file-uuid-003:1')
  })

  it('folds extra into metadata', () => {
    const result = transformAuditTrailEntry(event, 0)
    expect(result.metadata.signatureMethod).toBe('email')
  })

  it('passes AuditTrailEntrySchema validation', () => {
    const result = transformAuditTrailEntry(event, 0)
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})

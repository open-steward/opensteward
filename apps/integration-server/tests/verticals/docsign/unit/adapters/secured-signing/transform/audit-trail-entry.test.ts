import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type RawSecuredSigningDocumentLog,
} from '../../../../../../../src/verticals/docsign/adapters/secured-signing/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('secured-signing transformAuditTrailEntry', () => {
  const raw: RawSecuredSigningDocumentLog = {
    Name: 'Bob Doe',
    Email: 'bob@example.com',
    Action: 'Document signed by Bob Doe',
    Date: '2026-01-15T12:00:00.000Z',
    GMT: '+00:00',
  }

  const envelopeId = 'REF-001'

  it('constructs id and externalId as envelopeId:index', () => {
    const result = transformAuditTrailEntry(raw, envelopeId, 0)
    expect(result.id).toBe('REF-001:0')
    expect(result.externalId).toBe('REF-001:0')
  })

  it('maps envelopeId', () => {
    const result = transformAuditTrailEntry(raw, envelopeId, 0)
    expect(result.envelopeId).toBe('REF-001')
  })

  it('maps occurredAt as ISO datetime from Date field', () => {
    const result = transformAuditTrailEntry(raw, envelopeId, 0)
    expect(result.occurredAt).toBe('2026-01-15T12:00:00.000Z')
  })

  it('classifies "signed" action as signed eventType', () => {
    const result = transformAuditTrailEntry(raw, envelopeId, 0)
    expect(result.eventType).toBe('signed')
  })

  it('classifies "Document created" action as created eventType', () => {
    const result = transformAuditTrailEntry({ ...raw, Action: 'Document created' }, envelopeId, 1)
    expect(result.eventType).toBe('created')
  })

  it('classifies "Invitation sent" action as sent eventType', () => {
    const result = transformAuditTrailEntry(
      { ...raw, Action: 'Invitation sent to Bob' },
      envelopeId,
      2,
    )
    expect(result.eventType).toBe('sent')
  })

  it('classifies "Document viewed" action as viewed eventType', () => {
    const result = transformAuditTrailEntry(
      { ...raw, Action: 'Document viewed by Bob' },
      envelopeId,
      3,
    )
    expect(result.eventType).toBe('viewed')
  })

  it('classifies "Complete" action as completed eventType', () => {
    const result = transformAuditTrailEntry({ ...raw, Action: 'Document complete' }, envelopeId, 4)
    expect(result.eventType).toBe('completed')
  })

  it('classifies unknown action as other', () => {
    const result = transformAuditTrailEntry(
      { ...raw, Action: 'Something unusual happened' },
      envelopeId,
      5,
    )
    expect(result.eventType).toBe('other')
  })

  it('maps description from Action', () => {
    const result = transformAuditTrailEntry(raw, envelopeId, 0)
    expect(result.description).toBe('Document signed by Bob Doe')
  })

  it('maps actorName from Name', () => {
    const result = transformAuditTrailEntry(raw, envelopeId, 0)
    expect(result.actorName).toBe('Bob Doe')
  })

  it('maps actorEmail from Email', () => {
    const result = transformAuditTrailEntry(raw, envelopeId, 0)
    expect(result.actorEmail).toBe('bob@example.com')
  })

  it('falls back to epoch when Date is absent', () => {
    const result = transformAuditTrailEntry({ ...raw, Date: undefined }, envelopeId, 0)
    expect(result.occurredAt).toBe('1970-01-01T00:00:00.000Z')
  })

  it('sets platform to secured-signing', () => {
    const result = transformAuditTrailEntry(raw, envelopeId, 0)
    expect(result.platform).toBe('secured-signing')
  })

  it('includes action and gmt in metadata', () => {
    const result = transformAuditTrailEntry(raw, envelopeId, 0)
    expect(result.metadata.action).toBe('Document signed by Bob Doe')
    expect(result.metadata.gmt).toBe('+00:00')
  })

  it('passes AuditTrailEntrySchema.parse without throwing', () => {
    const result = transformAuditTrailEntry(raw, envelopeId, 0)
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})

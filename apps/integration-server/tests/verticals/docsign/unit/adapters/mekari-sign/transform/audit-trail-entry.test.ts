import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type SyntheticAuditEvent,
} from '../../../../../../../src/verticals/docsign/adapters/mekari-sign/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('mekari-sign transformAuditTrailEntry', () => {
  const raw: SyntheticAuditEvent = {
    envelopeId: 'mek_doc_001',
    occurredAt: '2024-01-20T14:30:00.000Z',
    type: 'signed',
    description: 'Document signed by Alice',
    actorId: 'sig_001',
    actorEmail: 'alice@example.com',
    actorName: 'Alice Smith',
  }

  it('maps id as envelopeId:index composite', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.id).toBe('mek_doc_001:0')
  })

  it('maps externalId as envelopeId:index composite', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.externalId).toBe('mek_doc_001:0')
  })

  it('maps envelopeId from event', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.envelopeId).toBe('mek_doc_001')
  })

  it('maps occurredAt as ISO datetime', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.occurredAt).toBe('2024-01-20T14:30:00.000Z')
  })

  it('falls back to epoch zero when occurredAt is absent', () => {
    const result = transformAuditTrailEntry({ ...raw, occurredAt: undefined }, 0)
    expect(result.occurredAt).toBe(new Date(0).toISOString())
  })

  it('maps eventType from type field', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.eventType).toBe('signed')
  })

  it('maps description from description field', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.description).toBe('Document signed by Alice')
  })

  it('maps actorId from actorId field', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.actorId).toBe('sig_001')
  })

  it('maps actorEmail from actorEmail field', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.actorEmail).toBe('alice@example.com')
  })

  it('maps actorName from actorName field', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.actorName).toBe('Alice Smith')
  })

  it('sets platform to mekari-sign', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.platform).toBe('mekari-sign')
  })

  it('includes rawType in metadata', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.metadata.rawType).toBe('signed')
  })

  it('leaves actorId undefined when not provided', () => {
    const result = transformAuditTrailEntry({ ...raw, actorId: undefined }, 0)
    expect(result.actorId).toBeUndefined()
  })

  it('passes AuditTrailEntrySchema.parse without throwing', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})

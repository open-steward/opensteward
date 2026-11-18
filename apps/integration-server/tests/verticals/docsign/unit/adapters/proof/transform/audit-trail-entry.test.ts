import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type SyntheticProofAuditEvent,
} from '../../../../../../../src/verticals/docsign/adapters/proof/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('proof transformAuditTrailEntry', () => {
  const raw: SyntheticProofAuditEvent = {
    envelopeId: 'txn_001',
    occurredAt: '2026-01-15T12:00:00.000Z',
    type: 'completed',
    description: 'Transaction completed',
    key: 'completed',
    actorName: 'Alice Lender',
  }

  it('constructs id as envelopeId:index', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.id).toBe('txn_001:0')
  })

  it('constructs externalId as envelopeId:key', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.externalId).toBe('txn_001:completed')
  })

  it('maps envelopeId', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.envelopeId).toBe('txn_001')
  })

  it('maps occurredAt as ISO datetime', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.occurredAt).toBe('2026-01-15T12:00:00.000Z')
  })

  it('maps eventType from type', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.eventType).toBe('completed')
  })

  it('maps description', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.description).toBe('Transaction completed')
  })

  it('maps actorName', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.actorName).toBe('Alice Lender')
  })

  it('falls back to epoch when occurredAt is unparseable', () => {
    const result = transformAuditTrailEntry({ ...raw, occurredAt: 'not-a-date' }, 1)
    expect(result.occurredAt).toBe('1970-01-01T00:00:00.000Z')
  })

  it('uses the index to differentiate multiple events', () => {
    const r0 = transformAuditTrailEntry(raw, 0)
    const r1 = transformAuditTrailEntry({ ...raw, key: 'sent' }, 1)
    expect(r0.id).not.toBe(r1.id)
  })

  it('sets platform to proof', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.platform).toBe('proof')
  })

  it('includes key in metadata', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.metadata.key).toBe('completed')
  })

  it('passes AuditTrailEntrySchema.parse without throwing', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})

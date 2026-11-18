import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type SyntheticAuditEvent,
} from '../../../../../../../src/verticals/docsign/adapters/swisscom-trust-services/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('swisscom-trust-services transformAuditTrailEntry', () => {
  const event: SyntheticAuditEvent = {
    envelopeId: 'resp-001',
    occurredAt: '2024-03-10T12:00:00.000Z',
    eventType: 'signed',
    description: 'Transaction signed successfully',
    extra: { serialNumber: 'SN-99', apTransId: 'AP-42' },
  }

  it('composes id from envelopeId and index', () => {
    const result = transformAuditTrailEntry(event, 0)
    expect(result.id).toBe('resp-001:0')
  })

  it('composes externalId from envelopeId and eventType', () => {
    const result = transformAuditTrailEntry(event, 0)
    expect(result.externalId).toBe('resp-001:signed')
  })

  it('preserves envelopeId', () => {
    const result = transformAuditTrailEntry(event, 0)
    expect(result.envelopeId).toBe('resp-001')
  })

  it('preserves occurredAt', () => {
    const result = transformAuditTrailEntry(event, 0)
    expect(result.occurredAt).toBe('2024-03-10T12:00:00.000Z')
  })

  it('preserves eventType', () => {
    const result = transformAuditTrailEntry(event, 0)
    expect(result.eventType).toBe('signed')
  })

  it('preserves description', () => {
    const result = transformAuditTrailEntry(event, 0)
    expect(result.description).toBe('Transaction signed successfully')
  })

  it('sets platform to swisscom-trust-services', () => {
    const result = transformAuditTrailEntry(event, 0)
    expect(result.platform).toBe('swisscom-trust-services')
  })

  it('surfaces extra fields as string metadata', () => {
    const result = transformAuditTrailEntry(event, 0)
    expect(result.metadata.serialNumber).toBe('SN-99')
    expect(result.metadata.apTransId).toBe('AP-42')
  })

  it('index affects the id but not the externalId', () => {
    const r0 = transformAuditTrailEntry(event, 0)
    const r2 = transformAuditTrailEntry(event, 2)
    expect(r2.id).toBe('resp-001:2')
    expect(r2.externalId).toBe(r0.externalId)
  })

  it('handles missing extra with empty metadata', () => {
    const noExtra: SyntheticAuditEvent = { ...event, extra: undefined }
    const result = transformAuditTrailEntry(noExtra, 0)
    expect(result.metadata).toEqual({})
  })

  it('passes AuditTrailEntrySchema.parse without throwing', () => {
    const result = transformAuditTrailEntry(event, 0)
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})

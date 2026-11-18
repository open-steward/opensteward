import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type SyntheticAuditEvent,
} from '../../../../../../../src/verticals/docsign/adapters/lleida-net/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('lleida-net transformAuditTrailEntry', () => {
  const raw: SyntheticAuditEvent = {
    envelopeId: 'env_42',
    occurredUnix: 1700001000,
    type: 'signed',
    description: 'Alice signed the document',
    signatoryId: '10',
    actorName: 'Alice Smith',
    actorEmail: 'alice@example.com',
    actorIp: '203.0.113.1',
  }

  it('maps id as envelopeId:index composite', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.id).toBe('env_42:0')
  })

  it('maps externalId as envelopeId:index composite', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.externalId).toBe('env_42:0')
  })

  it('maps envelopeId from event', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.envelopeId).toBe('env_42')
  })

  it('maps occurredAt from occurredUnix (epoch seconds → ISO)', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.occurredAt).toBe(new Date(1700001000 * 1000).toISOString())
  })

  it('falls back to epoch zero when occurredUnix is 0', () => {
    const result = transformAuditTrailEntry({ ...raw, occurredUnix: 0 }, 0)
    expect(result.occurredAt).toBe(new Date(0).toISOString())
  })

  it('maps eventType from type field', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.eventType).toBe('signed')
  })

  it('maps description from description field', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.description).toBe('Alice signed the document')
  })

  it('maps actorId from signatoryId', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.actorId).toBe('10')
  })

  it('maps actorEmail from actorEmail field', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.actorEmail).toBe('alice@example.com')
  })

  it('maps actorName from actorName field', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.actorName).toBe('Alice Smith')
  })

  it('maps actorIp from actorIp field', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.actorIp).toBe('203.0.113.1')
  })

  it('sets platform to lleida-net', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.platform).toBe('lleida-net')
  })

  it('includes signatory_id and source in metadata', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(result.metadata.signatory_id).toBe('10')
    expect(result.metadata.source).toBe('synthesized')
  })

  it('leaves actorId undefined when signatoryId is absent', () => {
    const result = transformAuditTrailEntry({ ...raw, signatoryId: undefined }, 0)
    expect(result.actorId).toBeUndefined()
  })

  it('passes AuditTrailEntrySchema.parse without throwing', () => {
    const result = transformAuditTrailEntry(raw, 0)
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})

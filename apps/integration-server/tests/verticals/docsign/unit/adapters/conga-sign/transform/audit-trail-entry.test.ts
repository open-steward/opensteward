import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  buildAuditEntries,
} from '../../../../../../../src/verticals/docsign/adapters/conga-sign/transform/audit-trail-entry'
import type { RawCongaSignPackage } from '../../../../../../../src/verticals/docsign/adapters/conga-sign/transform/envelope'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

// Re-export internal SynthEntry type by inferring from buildAuditEntries
type SynthEntry = ReturnType<typeof buildAuditEntries>[number]

const PKG: RawCongaSignPackage = {
  packageId: 'pkg-1',
  packageStatus: 'COMPLETED',
  name: 'Test Package',
  packageCreatedOn: '2025-01-01T00:00:00.000Z',
  packageCompletedOn: '2025-02-01T00:00:00.000Z',
  packageRecipients: [
    {
      id: 'r-1',
      email: 'alice@example.com',
      firstName: 'Alice',
      signedOn: '2025-01-20T00:00:00.000Z',
    },
  ],
}

describe('conga-sign/transform/audit-trail-entry – transformAuditTrailEntry', () => {
  const entry: SynthEntry = {
    eventType: 'signed',
    occurredAt: '2025-01-20T00:00:00.000Z',
    description: 'Recipient signed: Alice',
    actorId: 'r-1',
    actorEmail: 'alice@example.com',
    actorName: 'Alice',
  }

  it('builds id as <envelopeId>:<index>', () => {
    const out = transformAuditTrailEntry(entry, 'env-1', 0)
    expect(out.id).toBe('env-1:0')
    expect(out.externalId).toBe('env-1:0')
  })

  it('maps envelopeId through', () => {
    const out = transformAuditTrailEntry(entry, 'env-1', 0)
    expect(out.envelopeId).toBe('env-1')
  })

  it('maps occurredAt', () => {
    const out = transformAuditTrailEntry(entry, 'env-1', 0)
    expect(out.occurredAt).toBe('2025-01-20T00:00:00.000Z')
  })

  it('maps eventType through', () => {
    const out = transformAuditTrailEntry(entry, 'env-1', 0)
    expect(out.eventType).toBe('signed')
  })

  it('maps description through', () => {
    const out = transformAuditTrailEntry(entry, 'env-1', 0)
    expect(out.description).toBe('Recipient signed: Alice')
  })

  it('maps actor fields', () => {
    const out = transformAuditTrailEntry(entry, 'env-1', 0)
    expect(out.actorId).toBe('r-1')
    expect(out.actorEmail).toBe('alice@example.com')
    expect(out.actorName).toBe('Alice')
  })

  it('maps platform = conga-sign', () => {
    const out = transformAuditTrailEntry(entry, 'env-1', 0)
    expect(out.platform).toBe('conga-sign')
  })

  it('emits a schema-valid AuditTrailEntry', () => {
    expect(() =>
      AuditTrailEntrySchema.parse(transformAuditTrailEntry(entry, 'env-1', 0)),
    ).not.toThrow()
  })
})

describe('conga-sign/transform/audit-trail-entry – buildAuditEntries', () => {
  it('generates created + sent entries from packageCreatedOn', () => {
    const entries = buildAuditEntries(PKG)
    const types = entries.map((e) => e.eventType)
    expect(types).toContain('created')
    expect(types).toContain('sent')
  })

  it('generates signed entry for recipient with signedOn', () => {
    const entries = buildAuditEntries(PKG)
    const signed = entries.find((e) => e.eventType === 'signed')
    expect(signed).toBeDefined()
    expect(signed!.occurredAt).toBe('2025-01-20T00:00:00.000Z')
    expect(signed!.actorEmail).toBe('alice@example.com')
  })

  it('generates completed entry from packageCompletedOn', () => {
    const entries = buildAuditEntries(PKG)
    const completed = entries.find((e) => e.eventType === 'completed')
    expect(completed).toBeDefined()
    expect(completed!.occurredAt).toBe('2025-02-01T00:00:00.000Z')
  })

  it('generates declined entry for recipient with declinedOn', () => {
    const pkg: RawCongaSignPackage = {
      ...PKG,
      packageRecipients: [
        {
          id: 'r-2',
          email: 'bob@example.com',
          firstName: 'Bob',
          declinedOn: '2025-01-15T00:00:00.000Z',
        },
      ],
    }
    const entries = buildAuditEntries(pkg)
    const declined = entries.find((e) => e.eventType === 'declined')
    expect(declined).toBeDefined()
    expect(declined!.actorEmail).toBe('bob@example.com')
  })

  it('sorts entries chronologically', () => {
    const entries = buildAuditEntries(PKG)
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i]!.occurredAt >= entries[i - 1]!.occurredAt).toBe(true)
    }
  })
})

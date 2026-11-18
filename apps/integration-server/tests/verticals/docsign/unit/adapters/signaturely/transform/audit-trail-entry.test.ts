import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type RawSignaturelyActivity,
} from '../../../../../../../src/verticals/docsign/adapters/signaturely/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('signaturely transformAuditTrailEntry', () => {
  it('maps a sign event with signer info to canonical AuditTrailEntry', () => {
    const raw: RawSignaturelyActivity = {
      id: 'act-001',
      type: 'sign',
      sourceIP: '192.0.2.1',
      signers: [{ name: 'Alice Smith', email: 'alice@example.com' }],
      documentId: 'doc-env-1',
      createdAt: '2025-03-15T10:00:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, 'env-1', 0)

    expect(result.id).toBe('env-1:0')
    expect(result.envelopeId).toBe('env-1')
    expect(result.eventType).toBe('signed')
    expect(result.actorEmail).toBe('alice@example.com')
    expect(result.actorName).toBe('Alice Smith')
    expect(result.actorIp).toBe('192.0.2.1')
    expect(result.occurredAt).toBe('2025-03-15T10:00:00.000Z')
    expect(result.platform).toBe('signaturely')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('maps a create event with no signer info and falls back to defaults', () => {
    const raw: RawSignaturelyActivity = {
      id: 'act-002',
      type: 'create',
      documentId: 'doc-env-1',
      createdAt: '2025-03-15T08:00:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, 'env-1', 1)

    expect(result.id).toBe('env-1:1')
    expect(result.eventType).toBe('created')
    expect(result.description).toBe('Document created')
    expect(result.actorEmail).toBeUndefined()
    expect(result.actorName).toBeUndefined()
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('maps an unknown event type to "other"', () => {
    const raw: RawSignaturelyActivity = {
      id: 'act-003',
      type: 'unknown_event',
      createdAt: '2025-03-15T09:00:00.000Z',
    }
    const result = transformAuditTrailEntry(raw, 'env-2', 0)

    expect(result.eventType).toBe('other')
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('parses the documented example activity row', () => {
    // Verbatim row from https://docs.signaturely.com/ "Get document activity".
    const raw: RawSignaturelyActivity = {
      id: '4d3b96c0-b169-4a85-b1f6-ab8b260596b1',
      type: 'send',
      sourceIP: '::1',
      signers: [{ name: 'Maksim Lebedev', email: 'maksim@domain.ltd' }],
      documentId: 'cb9d98ec-d1b9-4d7f-9c5a-78eb505a03fc',
      createdAt: '2022-03-30T11:40:41.620Z',
    }
    const result = AuditTrailEntrySchema.parse(
      transformAuditTrailEntry(raw, 'cb9d98ec-d1b9-4d7f-9c5a-78eb505a03fc', 1),
    )
    expect(result.externalId).toBe('4d3b96c0-b169-4a85-b1f6-ab8b260596b1')
    expect(result.eventType).toBe('sent')
    expect(result.occurredAt).toBe('2022-03-30T11:40:41.620Z')
    expect(result.actorEmail).toBe('maksim@domain.ltd')
    expect(result.actorIp).toBe('::1')
  })

  it.each([
    ['create', 'created'],
    ['update', 'corrected'],
    ['send', 'sent'],
    ['view', 'viewed'],
    ['sign', 'signed'],
    ['complete', 'completed'],
    ['revert', 'voided'],
    ['preparersign', 'signed'],
  ] as const)('maps the documented activity type %s to %s', (type, expected) => {
    // Enum from https://docs.signaturely.com/ "Get document activity":
    // "create" | "update" | "send" | "view" | "sign" | "complete" | "revert" | "preparersign"
    const raw: RawSignaturelyActivity = {
      id: '4d3b96c0-b169-4a85-b1f6-ab8b260596b1',
      type,
      sourceIP: '::1',
      signers: null,
      documentId: 'cb9d98ec-d1b9-4d7f-9c5a-78eb505a03fc',
      createdAt: '2022-03-30T11:40:41.620Z',
    }
    const result = AuditTrailEntrySchema.parse(transformAuditTrailEntry(raw, 'env-4', 0))
    expect(result.eventType).toBe(expected)
  })

  it('throws rather than inventing a timestamp when createdAt is missing', () => {
    const raw: RawSignaturelyActivity = { id: 'act-004' }
    expect(() => transformAuditTrailEntry(raw, 'env-3', 0)).toThrow(/createdAt/)
  })

  it('throws rather than inventing an id when the documented id is missing', () => {
    const raw = { createdAt: '2022-03-30T11:40:41.620Z' } as unknown as RawSignaturelyActivity
    expect(() => transformAuditTrailEntry(raw, 'env-3', 0)).toThrow(/id/)
  })
})

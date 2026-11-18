import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type SyntheticAuditEvent,
} from '../../../../../../../src/verticals/docsign/adapters/anvil/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('anvil transformAuditTrailEntry', () => {
  it('maps a synthetic signed event to canonical AuditTrailEntry', () => {
    const event: SyntheticAuditEvent = {
      envelopeId: 'pkt-001',
      occurredAt: '2026-01-10T00:00:00.000Z',
      type: 'signed',
      signerEid: 'sgn-001',
      signerEmail: 'alice@example.com',
      signerName: 'Alice Smith',
      description: 'Alice Smith signed the packet',
    }

    const result = transformAuditTrailEntry(event, 2)

    // id built from envelopeId:index
    expect(result.id).toBe('pkt-001:2')
    expect(result.externalId).toBe('pkt-001:2')
    expect(result.envelopeId).toBe('pkt-001')
    // type maps directly through TYPE_MAP
    expect(result.eventType).toBe('signed')
    expect(result.description).toBe('Alice Smith signed the packet')
    expect(result.actorId).toBe('sgn-001')
    expect(result.actorEmail).toBe('alice@example.com')
    expect(result.actorName).toBe('Alice Smith')
    expect(result.platform).toBe('anvil')
    // metadata carries rawType
    expect(result.metadata.rawType).toBe('signed')

    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('maps all synthetic type values to the correct canonical eventType', () => {
    const check = (type: SyntheticAuditEvent['type']) =>
      transformAuditTrailEntry({ envelopeId: 'env', type, description: 'x' }, 0).eventType

    expect(check('created')).toBe('created')
    expect(check('sent')).toBe('sent')
    expect(check('viewed')).toBe('viewed')
    expect(check('signed')).toBe('signed')
    expect(check('completed')).toBe('completed')
  })

  it('falls back to epoch when occurredAt is absent', () => {
    const event: SyntheticAuditEvent = {
      envelopeId: 'pkt-x',
      type: 'created',
      description: 'Packet created',
    }
    const result = transformAuditTrailEntry(event, 0)
    expect(result.occurredAt).toBe(new Date(0).toISOString())
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })

  it('actorIp is always undefined (anvil synthetic events have no IP)', () => {
    const event: SyntheticAuditEvent = {
      envelopeId: 'env',
      type: 'completed',
      description: 'done',
    }
    const result = transformAuditTrailEntry(event, 0)
    expect(result.actorIp).toBeUndefined()
  })
})

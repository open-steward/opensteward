import { describe, it, expect } from 'vitest'
import {
  transformAuditTrailEntry,
  type RawBlueinkEvent,
} from '../../../../../../../src/verticals/docsign/adapters/blueink/transform/audit-trail-entry'
import { AuditTrailEntrySchema } from '../../../../../../../src/verticals/docsign/schema/audit-trail-entry'

describe('blueink transformAuditTrailEntry', () => {
  const rawSigned: RawBlueinkEvent = {
    kind: 'packet_signed',
    description: 'Packet was signed by signer.',
    timestamp: '2024-01-20T14:30:00.000Z',
    packet_id: 'pkt_1',
  }

  it('maps id as envelopeId:index composite', () => {
    const result = transformAuditTrailEntry(rawSigned, 'bnd_abc123', 0)
    expect(result.id).toBe('bnd_abc123:0')
  })

  it('maps externalId as envelopeId:index composite', () => {
    const result = transformAuditTrailEntry(rawSigned, 'bnd_abc123', 0)
    expect(result.externalId).toBe('bnd_abc123:0')
  })

  it('maps envelopeId from parameter', () => {
    const result = transformAuditTrailEntry(rawSigned, 'bnd_abc123', 0)
    expect(result.envelopeId).toBe('bnd_abc123')
  })

  it('maps occurredAt from timestamp', () => {
    const result = transformAuditTrailEntry(rawSigned, 'bnd_abc123', 0)
    expect(result.occurredAt).toBe('2024-01-20T14:30:00.000Z')
  })

  it('falls back to epoch when timestamp is absent', () => {
    const result = transformAuditTrailEntry({ kind: 'bundle_created' }, 'bnd_abc123', 0)
    expect(result.occurredAt).toBe(new Date(0).toISOString())
  })

  it('maps kind containing "sign" → signed event type', () => {
    const result = transformAuditTrailEntry(rawSigned, 'bnd_abc123', 0)
    expect(result.eventType).toBe('signed')
  })

  it('maps kind containing "create" → created event type', () => {
    const result = transformAuditTrailEntry(
      { ...rawSigned, kind: 'bundle_created' },
      'bnd_abc123',
      1,
    )
    expect(result.eventType).toBe('created')
  })

  it('maps kind containing "new" → created event type', () => {
    const result = transformAuditTrailEntry({ ...rawSigned, kind: 'bundle_new' }, 'bnd_abc123', 1)
    expect(result.eventType).toBe('created')
  })

  it('maps kind containing "sent" → sent event type', () => {
    const result = transformAuditTrailEntry({ ...rawSigned, kind: 'bundle_sent' }, 'bnd_abc123', 2)
    expect(result.eventType).toBe('sent')
  })

  it('maps kind containing "launch" → sent event type', () => {
    const result = transformAuditTrailEntry(
      { ...rawSigned, kind: 'bundle_launched' },
      'bnd_abc123',
      2,
    )
    expect(result.eventType).toBe('sent')
  })

  it('maps kind containing "view" → viewed event type', () => {
    const result = transformAuditTrailEntry(
      { ...rawSigned, kind: 'packet_viewed' },
      'bnd_abc123',
      3,
    )
    expect(result.eventType).toBe('viewed')
  })

  it('maps kind containing "open" → viewed event type', () => {
    const result = transformAuditTrailEntry(
      { ...rawSigned, kind: 'bundle_opened' },
      'bnd_abc123',
      3,
    )
    expect(result.eventType).toBe('viewed')
  })

  it('maps kind containing "complet" → signed event type', () => {
    const result = transformAuditTrailEntry(
      { ...rawSigned, kind: 'bundle_completed' },
      'bnd_abc123',
      4,
    )
    expect(result.eventType).toBe('signed')
  })

  it('maps kind containing "declin" → declined event type', () => {
    const result = transformAuditTrailEntry(
      { ...rawSigned, kind: 'packet_declined' },
      'bnd_abc123',
      5,
    )
    expect(result.eventType).toBe('declined')
  })

  it('maps kind containing "cancel" → voided event type', () => {
    const result = transformAuditTrailEntry(
      { ...rawSigned, kind: 'bundle_cancelled' },
      'bnd_abc123',
      6,
    )
    expect(result.eventType).toBe('voided')
  })

  it('maps kind containing "void" → voided event type', () => {
    const result = transformAuditTrailEntry(
      { ...rawSigned, kind: 'bundle_voided' },
      'bnd_abc123',
      6,
    )
    expect(result.eventType).toBe('voided')
  })

  it('maps kind containing "expir" → expired event type', () => {
    const result = transformAuditTrailEntry(
      { ...rawSigned, kind: 'bundle_expired' },
      'bnd_abc123',
      7,
    )
    expect(result.eventType).toBe('expired')
  })

  it('maps kind containing "remind" → auto_reminded event type', () => {
    // Use a kind that only contains 'remind' and not earlier-matching substrings like 'sent'
    const result = transformAuditTrailEntry(
      { ...rawSigned, kind: 'remind_packet' },
      'bnd_abc123',
      8,
    )
    expect(result.eventType).toBe('auto_reminded')
  })

  it('maps kind containing "auth" → authenticated event type', () => {
    const result = transformAuditTrailEntry(
      { ...rawSigned, kind: 'packet_authenticated' },
      'bnd_abc123',
      9,
    )
    expect(result.eventType).toBe('authenticated')
  })

  it('maps kind containing "error" → delivery_failed event type', () => {
    const result = transformAuditTrailEntry(
      { ...rawSigned, kind: 'delivery_error' },
      'bnd_abc123',
      10,
    )
    expect(result.eventType).toBe('delivery_failed')
  })

  it('maps kind containing "fail" → delivery_failed event type', () => {
    const result = transformAuditTrailEntry(
      { ...rawSigned, kind: 'email_failed' },
      'bnd_abc123',
      10,
    )
    expect(result.eventType).toBe('delivery_failed')
  })

  it('maps kind containing "bounce" → delivery_failed event type', () => {
    const result = transformAuditTrailEntry(
      { ...rawSigned, kind: 'email_bounced' },
      'bnd_abc123',
      10,
    )
    expect(result.eventType).toBe('delivery_failed')
  })

  it('maps unknown kind → other event type', () => {
    const result = transformAuditTrailEntry(
      { ...rawSigned, kind: 'packet_unlocked' },
      'bnd_abc123',
      11,
    )
    expect(result.eventType).toBe('other')
  })

  it('maps description from raw description field', () => {
    const result = transformAuditTrailEntry(rawSigned, 'bnd_abc123', 0)
    expect(result.description).toBe('Packet was signed by signer.')
  })

  it('falls back to kind as description when description is absent', () => {
    const result = transformAuditTrailEntry(
      { kind: 'bundle_created', timestamp: '2024-01-15T10:00:00.000Z' },
      'bnd_abc123',
      0,
    )
    expect(result.description).toBe('bundle_created')
  })

  it('maps actorId from packet_id', () => {
    const result = transformAuditTrailEntry(rawSigned, 'bnd_abc123', 0)
    expect(result.actorId).toBe('pkt_1')
  })

  it('leaves actorId undefined when packet_id is absent', () => {
    const result = transformAuditTrailEntry(
      { kind: 'bundle_created', timestamp: '2024-01-15T10:00:00.000Z' },
      'bnd_abc123',
      0,
    )
    expect(result.actorId).toBeUndefined()
  })

  it('sets platform to blueink', () => {
    const result = transformAuditTrailEntry(rawSigned, 'bnd_abc123', 0)
    expect(result.platform).toBe('blueink')
  })

  it('includes kind and packetId in metadata', () => {
    const result = transformAuditTrailEntry(rawSigned, 'bnd_abc123', 0)
    expect(result.metadata.kind).toBe('packet_signed')
    expect(result.metadata.packetId).toBe('pkt_1')
  })

  it('passes AuditTrailEntrySchema.parse without throwing', () => {
    const result = transformAuditTrailEntry(rawSigned, 'bnd_abc123', 0)
    expect(() => AuditTrailEntrySchema.parse(result)).not.toThrow()
  })
})

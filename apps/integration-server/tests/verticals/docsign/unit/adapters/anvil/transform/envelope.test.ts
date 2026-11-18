import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawAnvilEtchPacket,
} from '../../../../../../../src/verticals/docsign/adapters/anvil/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('anvil transformEnvelope', () => {
  it('maps a completed EtchPacket to canonical Envelope', () => {
    const raw: RawAnvilEtchPacket = {
      eid: 'pkt-001',
      name: 'Vendor Agreement',
      status: 'completed',
      isTest: false,
      detailsURL: 'https://app.useanvil.com/packets/pkt-001',
      documentGroup: {
        eid: 'dg-001',
        status: 'completed',
        signers: [
          { eid: 'sgn-1', routingOrder: 1, email: 'alice@example.com', name: 'Alice' },
          { eid: 'sgn-2', routingOrder: 2, email: 'bob@example.com', name: 'Bob' },
        ],
        files: [
          { eid: 'file-a', name: 'Agreement.pdf', type: 'pdf' },
          { eid: 'file-b', name: 'Exhibit.pdf', type: 'pdf' },
        ],
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      sentAt: '2026-01-02T00:00:00.000Z',
      completedAt: '2026-01-10T00:00:00.000Z',
      updatedAt: '2026-01-10T00:00:00.000Z',
    }

    const result = transformEnvelope(raw)

    // id maps from raw.eid
    expect(result.id).toBe('pkt-001')
    expect(result.externalId).toBe('pkt-001')
    // status 'completed' → 'completed'
    expect(result.status).toBe('completed')
    // subject from raw.name
    expect(result.subject).toBe('Vendor Agreement')
    // different routingOrders → sequential
    expect(result.signingOrder).toBe('sequential')
    // signers sorted by routingOrder
    expect(result.signerIds).toEqual(['sgn-1', 'sgn-2'])
    // documentIds prefixed with packetEid:fileEid
    expect(result.documentIds).toEqual(['pkt-001:file-a', 'pkt-001:file-b'])
    expect(result.platform).toBe('anvil')
    expect(result.metadata.documentGroupEid).toBe('dg-001')
    expect(result.metadata.detailsURL).toBe('https://app.useanvil.com/packets/pkt-001')

    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps status values correctly', () => {
    const check = (status: string | undefined) => transformEnvelope({ eid: 'x', status }).status

    expect(check('draft')).toBe('draft')
    expect(check('sent')).toBe('sent')
    expect(check('partial')).toBe('sent')
    expect(check('completed')).toBe('completed')
    expect(check('archived')).toBe('voided')
    expect(check('unknown')).toBe('draft')
    expect(check(undefined)).toBe('draft')
  })

  it('derives parallel signing order when signers share same routingOrder', () => {
    const raw: RawAnvilEtchPacket = {
      eid: 'pkt-002',
      documentGroup: {
        signers: [
          { eid: 's1', routingOrder: 1 },
          { eid: 's2', routingOrder: 1 },
        ],
      },
    }
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('parallel')
  })

  it('handles absent documentGroup gracefully', () => {
    const result = transformEnvelope({ eid: 'pkt-003' })
    expect(result.signerIds).toEqual([])
    expect(result.documentIds).toEqual([])
    expect(result.subject).toBe('')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})

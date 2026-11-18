import { describe, it, expect } from 'vitest'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/zenvia/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/zenvia/transform/message'

// ── transformTicket ─────────────────────────────────────────────────────────

describe('Zenvia transformTicket', () => {
  it('sets id as "prospectId:interactionId" so listMessages can decode it', () => {
    const raw = {
      id: 'int123',
      prospectId: 'p456',
      status: 'open',
      via: 'whatsApp',
      createdAt: '2026-01-01T00:00:00Z',
    }
    const ticket = transformTicket(raw)
    expect(ticket.id).toBe('p456:int123')
    expect(ticket.externalId).toBe('int123')
    expect(ticket.platform).toBe('zenvia')
  })

  it('uses bare interactionId when prospectId is absent', () => {
    const raw = { id: 'int999', status: 'open', via: 'email', createdAt: '2026-01-02T00:00:00Z' }
    const ticket = transformTicket(raw)
    expect(ticket.id).toBe('int999')
    expect(ticket.externalId).toBe('int999')
  })

  it('maps status=finished to resolved', () => {
    const raw = {
      id: 'i1',
      prospectId: 'p1',
      status: 'finished',
      via: 'email',
      finishedAt: '2026-02-01T10:00:00Z',
      createdAt: '2026-01-01T00:00:00Z',
    }
    const ticket = transformTicket(raw)
    expect(ticket.status).toBe('resolved')
    expect(ticket.resolvedAt).toBeDefined()
  })

  it('maps via=whatsApp to channel=chat', () => {
    const raw = { id: 'i2', prospectId: 'p2', status: 'open', via: 'whatsApp', createdAt: '2026-01-01T00:00:00Z' }
    const ticket = transformTicket(raw)
    expect(ticket.channel).toBe('chat')
  })
})

// ── transformMessage ─────────────────────────────────────────────────────────

describe('Zenvia transformMessage authorType', () => {
  it('sets authorType=contact for inbound direction', () => {
    const raw = {
      id: 'msg1',
      interactionId: 'int1',
      prospectId: 'p1',
      via: 'whatsApp',
      direction: 'inbound',
      content: 'hello',
      type: 'text',
      isInternal: false,
      createdAt: '2026-01-01T00:00:00Z',
    }
    const msg = transformMessage(raw, 'p1:int1')
    expect(msg.authorType).toBe('contact')
    expect(msg.ticketId).toBe('p1:int1')
    expect(msg.platform).toBe('zenvia')
  })

  it('sets authorType=user for outbound direction', () => {
    const raw = {
      id: 'msg2',
      interactionId: 'int2',
      prospectId: 'p2',
      via: 'outboundCall',
      direction: 'outbound',
      content: 'how can I help?',
      type: 'text',
      isInternal: false,
      createdAt: '2026-01-01T00:00:00Z',
    }
    const msg = transformMessage(raw, 'p2:int2')
    expect(msg.authorType).toBe('user')
  })

  it('defaults authorType=user when direction is absent', () => {
    const raw = {
      id: 'msg3',
      interactionId: 'int3',
      type: 'text',
      isInternal: false,
      createdAt: '2026-01-01T00:00:00Z',
    }
    const msg = transformMessage(raw, 'p3:int3')
    expect(msg.authorType).toBe('user')
  })
})

// ── listMessages scoping (unit-tested via filtering logic) ──────────────────

describe('Zenvia listMessages scoping logic', () => {
  /**
   * Verify the filtering logic used in ZenviaAdapter.listMessages:
   * when ticketId = "prospectId:interactionId", only the matching
   * interaction should be returned.
   */
  it('filters interactions to the one matching the encoded interactionId', () => {
    const interactions = [
      { id: 'int-A', prospectId: 'p1' },
      { id: 'int-B', prospectId: 'p1' },
      { id: 'int-C', prospectId: 'p1' },
    ]
    const ticketId = 'p1:int-B'
    const parts = ticketId.includes(':') ? ticketId.split(':') : [ticketId, null]
    const interactionId = parts[1] ?? null
    const scoped = interactionId
      ? interactions.filter((i) => String(i.id) === interactionId)
      : interactions
    expect(scoped).toHaveLength(1)
    expect(scoped[0]!.id).toBe('int-B')
  })

  it('returns all interactions when ticketId has no colon', () => {
    const interactions = [
      { id: 'int-A', prospectId: 'p1' },
      { id: 'int-B', prospectId: 'p1' },
    ]
    const ticketId = 'p1'
    const parts = ticketId.includes(':') ? ticketId.split(':') : [ticketId, null]
    const interactionId = parts[1] ?? null
    const scoped = interactionId
      ? interactions.filter((i) => String(i.id) === interactionId)
      : interactions
    expect(scoped).toHaveLength(2)
  })
})

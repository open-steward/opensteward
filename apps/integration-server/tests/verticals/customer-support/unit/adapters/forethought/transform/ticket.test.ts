import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawForethoughtConversation,
} from '../../../../../../../src/verticals/customer-support/adapters/forethought/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'

describe('forethought transformTicket', () => {
  const raw: RawForethoughtConversation = {
    conversation_id: 'conv-xyz-789',
    status: 'active',
    user_id: 'usr-42',
    subject: 'Order tracking issue',
    channel: 'widget',
    created_at: '2024-05-01T10:00:00.000Z',
    updated_at: '2024-05-01T11:00:00.000Z',
    resolved_at: null,
    csat_score: 4,
    tags: ['ecommerce', 'order'],
  }

  it('maps conversation_id to id and externalId', () => {
    const result = transformTicket(raw)
    expect(result.id).toBe('conv-xyz-789')
    expect(result.externalId).toBe('conv-xyz-789')
  })

  it('maps subject field', () => {
    const result = transformTicket(raw)
    expect(result.subject).toBe('Order tracking issue')
  })

  it('maps status active to open', () => {
    const result = transformTicket(raw)
    expect(result.status).toBe('open')
  })

  it('maps status resolved to resolved', () => {
    const resolved: RawForethoughtConversation = {
      ...raw,
      status: 'resolved',
      resolved_at: '2024-05-01T11:00:00.000Z',
    }
    const result = transformTicket(resolved)
    expect(result.status).toBe('resolved')
  })

  it('maps status pending to pending', () => {
    const pending: RawForethoughtConversation = { ...raw, status: 'pending' }
    const result = transformTicket(pending)
    expect(result.status).toBe('pending')
  })

  it('maps status closed to closed', () => {
    const closed: RawForethoughtConversation = {
      ...raw,
      status: 'closed',
      resolved_at: '2024-05-02T09:00:00.000Z',
    }
    const result = transformTicket(closed)
    expect(result.status).toBe('closed')
  })

  it('always sets channel to chat (Forethought is chat-native)', () => {
    const result = transformTicket(raw)
    expect(result.channel).toBe('chat')
  })

  it('maps user_id to requesterId', () => {
    const result = transformTicket(raw)
    expect(result.requesterId).toBe('usr-42')
  })

  it('uses anonymous when user_id is absent', () => {
    const anon: RawForethoughtConversation = { ...raw, user_id: null }
    const result = transformTicket(anon)
    expect(result.requesterId).toBe('anonymous')
  })

  it('maps tags array to tagIds', () => {
    const result = transformTicket(raw)
    expect(result.tagIds).toEqual(['ecommerce', 'order'])
  })

  it('maps csat_score 4 to satisfactionRating 4', () => {
    const result = transformTicket(raw)
    expect(result.satisfactionRating).toBe(4)
  })

  it('does not include csat when out of range', () => {
    const badScore: RawForethoughtConversation = { ...raw, csat_score: 0 }
    const result = transformTicket(badScore)
    expect(result.satisfactionRating).toBeUndefined()
  })

  it('sets resolvedAt when resolved', () => {
    const resolved: RawForethoughtConversation = {
      ...raw,
      status: 'resolved',
      resolved_at: '2024-05-01T11:30:00.000Z',
    }
    const result = transformTicket(resolved)
    expect(result.resolvedAt).toBe('2024-05-01T11:30:00.000Z')
  })

  it('does not set resolvedAt when status is open', () => {
    const result = transformTicket(raw)
    expect(result.resolvedAt).toBeUndefined()
  })

  it('uses fallback subject when subject is absent', () => {
    const noSubject: RawForethoughtConversation = { ...raw, subject: null }
    const result = transformTicket(noSubject)
    expect(result.subject).toBe('(Forethought conversation)')
  })

  it('sets platform to forethought', () => {
    const result = transformTicket(raw)
    expect(result.platform).toBe('forethought')
  })

  it('produces a TicketSchema-valid result', () => {
    const result = transformTicket(raw)
    expect(() => TicketSchema.parse(result)).not.toThrow()
  })

  it('handles minimal input', () => {
    const minimal: RawForethoughtConversation = { conversation_id: 'min-1' }
    const result = transformTicket(minimal)
    expect(result.id).toBe('min-1')
    expect(result.status).toBe('open')
    expect(() => TicketSchema.parse(result)).not.toThrow()
  })
})

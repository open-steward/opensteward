import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawLibredeskConversation,
} from '../../../../../../../src/verticals/customer-support/adapters/libredesk/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'

describe('libredesk transformTicket', () => {
  it('maps status open to open', () => {
    const raw: RawLibredeskConversation = {
      id: 1,
      uuid: 'u1',
      status: 'open',
      created_at: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.status).toBe('open')
  })

  it('maps status replied to open', () => {
    const raw: RawLibredeskConversation = {
      id: 2,
      uuid: 'u2',
      status: 'replied',
      created_at: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.status).toBe('open')
  })

  it('maps status snoozed to on_hold', () => {
    const raw: RawLibredeskConversation = {
      id: 3,
      uuid: 'u3',
      status: 'snoozed',
      created_at: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.status).toBe('on_hold')
  })

  it('maps status resolved to resolved', () => {
    const raw: RawLibredeskConversation = {
      id: 4,
      uuid: 'u4',
      status: 'resolved',
      created_at: '2026-01-15T09:30:00.000Z',
      updated_at: '2026-02-01T14:20:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.status).toBe('resolved')
  })

  it('maps priority medium to normal', () => {
    const raw: RawLibredeskConversation = {
      id: 5,
      uuid: 'u5',
      priority: 'medium',
      created_at: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.priority).toBe('normal')
  })

  it('maps inbox_channel live_chat to chat', () => {
    const raw: RawLibredeskConversation = {
      id: 6,
      uuid: 'u6',
      inbox_channel: 'live_chat',
      created_at: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.channel).toBe('chat')
  })

  it('maps inbox_channel email to email', () => {
    const raw: RawLibredeskConversation = {
      id: 7,
      uuid: 'u7',
      inbox_channel: 'email',
      created_at: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.channel).toBe('email')
  })

  it('prefers uuid as externalId', () => {
    const raw: RawLibredeskConversation = {
      id: 8,
      uuid: 'conv-uuid-xyz',
      created_at: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.externalId).toBe('conv-uuid-xyz')
    expect(result.id).toBe('8')
  })

  it('prefers reference_number as number', () => {
    const raw: RawLibredeskConversation = {
      id: 9,
      uuid: 'u9',
      reference_number: 'REF-1234',
      created_at: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.number).toBe('REF-1234')
  })

  it('extracts tagIds from tags array of strings', () => {
    const raw: RawLibredeskConversation = {
      id: 10,
      uuid: 'u10',
      tags: ['billing', 'urgent'],
      created_at: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.tagIds).toEqual(['billing', 'urgent'])
  })

  it('extracts tagIds from tags array of objects with name', () => {
    const raw: RawLibredeskConversation = {
      id: 11,
      uuid: 'u11',
      tags: [{ name: 'login' }, { name: 'vip' }],
      created_at: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.tagIds).toEqual(['login', 'vip'])
  })

  it('maps contact_id to requesterId', () => {
    const raw: RawLibredeskConversation = {
      id: 12,
      uuid: 'u12',
      contact_id: 55,
      created_at: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.requesterId).toBe('55')
  })

  it('maps assigned_team_id to teamId', () => {
    const raw: RawLibredeskConversation = {
      id: 13,
      uuid: 'u13',
      assigned_team_id: 7,
      created_at: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.teamId).toBe('7')
  })

  it('maps csat_rating to satisfactionRating', () => {
    const raw: RawLibredeskConversation = {
      id: 14,
      uuid: 'u14',
      csat_rating: 4,
      created_at: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.satisfactionRating).toBe(4)
  })

  it('sets platform to libredesk', () => {
    const raw: RawLibredeskConversation = {
      id: 15,
      uuid: 'u15',
      created_at: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.platform).toBe('libredesk')
  })

  it('passes TicketSchema validation', () => {
    const raw: RawLibredeskConversation = {
      id: 99,
      uuid: 'valid-uuid',
      reference_number: 'REF-99',
      subject: 'Valid ticket',
      status: 'open',
      priority: 'high',
      inbox_channel: 'email',
      contact_id: 5,
      assigned_user_id: 10,
      assigned_team_id: 3,
      tags: ['billing'],
      csat_rating: 5,
      created_at: '2026-01-15T09:30:00.000Z',
      updated_at: '2026-02-01T14:20:00.000Z',
    }
    const result = transformTicket(raw)
    expect(() => TicketSchema.parse(result)).not.toThrow()
  })
})

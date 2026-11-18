import { describe, it, expect } from 'vitest'
import {
  transformTicket,
  type RawLivehelpnowTicket,
} from '../../../../../../../src/verticals/customer-support/adapters/livehelpnow/transform/ticket'
import { TicketSchema } from '../../../../../../../src/verticals/customer-support/schema/ticket'

describe('livehelpnow transformTicket', () => {
  it('maps status "open" to open', () => {
    const raw: RawLivehelpnowTicket = {
      id: 1,
      status: 'open',
      created_time: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.status).toBe('open')
  })

  it('maps status "new" to open', () => {
    const raw: RawLivehelpnowTicket = {
      id: 2,
      status: 'new',
      created_time: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.status).toBe('open')
  })

  it('maps status "in progress" to in_progress', () => {
    const raw: RawLivehelpnowTicket = {
      id: 3,
      status: 'in progress',
      created_time: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.status).toBe('in_progress')
  })

  it('maps status "on hold" to on_hold', () => {
    const raw: RawLivehelpnowTicket = {
      id: 4,
      status: 'on hold',
      created_time: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.status).toBe('on_hold')
  })

  it('maps status "resolved" to resolved', () => {
    const raw: RawLivehelpnowTicket = {
      id: 5,
      status: 'resolved',
      created_time: '2026-01-15T09:30:00.000Z',
      updated_time: '2026-02-01T14:20:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.status).toBe('resolved')
    expect(result.resolvedAt).toBe('2026-02-01T14:20:00.000Z')
  })

  it('falls back to status_id when status absent', () => {
    const raw: RawLivehelpnowTicket = {
      id: 6,
      status_id: 2,
      created_time: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.status).toBe('pending')
  })

  it('maps priority "high" to high', () => {
    const raw: RawLivehelpnowTicket = {
      id: 7,
      priority: 'high',
      created_time: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.priority).toBe('high')
  })

  it('maps priority "normal" to normal', () => {
    const raw: RawLivehelpnowTicket = {
      id: 8,
      priority: 'normal',
      created_time: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.priority).toBe('normal')
  })

  it('maps source "email" to email channel', () => {
    const raw: RawLivehelpnowTicket = {
      id: 9,
      source: 'email',
      created_time: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.channel).toBe('email')
  })

  it('maps source "phone" to voice channel', () => {
    const raw: RawLivehelpnowTicket = {
      id: 10,
      source: 'phone',
      created_time: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.channel).toBe('voice')
  })

  it('maps source "web form" to web channel', () => {
    const raw: RawLivehelpnowTicket = {
      id: 11,
      source: 'web form',
      created_time: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.channel).toBe('web')
  })

  it('prefers title over body as subject', () => {
    const raw: RawLivehelpnowTicket = {
      id: 12,
      title: 'The Title',
      body: 'The Body',
      created_time: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.subject).toBe('The Title')
  })

  it('falls back to body when title absent', () => {
    const raw: RawLivehelpnowTicket = {
      id: 13,
      body: 'No title here',
      created_time: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.subject).toBe('No title here')
  })

  it('prefers email over visitor_id as requesterId', () => {
    const raw: RawLivehelpnowTicket = {
      id: 14,
      email: 'jane@example.com',
      visitor_id: 'vis-123',
      created_time: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.requesterId).toBe('jane@example.com')
  })

  it('falls back to visitor_id when email absent', () => {
    const raw: RawLivehelpnowTicket = {
      id: 15,
      visitor_id: 'vis-456',
      created_time: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.requesterId).toBe('vis-456')
  })

  it('maps assigned_to to assigneeId', () => {
    const raw: RawLivehelpnowTicket = {
      id: 16,
      assigned_to: 7,
      created_time: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.assigneeId).toBe('7')
  })

  it('maps tags array to tagIds', () => {
    const raw: RawLivehelpnowTicket = {
      id: 17,
      tags: ['billing', 'vip'],
      created_time: '2026-01-15T09:30:00.000Z',
    }
    const result = transformTicket(raw)
    expect(result.tagIds).toEqual(['billing', 'vip'])
  })

  it('sets platform to livehelpnow', () => {
    const raw: RawLivehelpnowTicket = { id: 18, created_time: '2026-01-15T09:30:00.000Z' }
    const result = transformTicket(raw)
    expect(result.platform).toBe('livehelpnow')
  })

  it('passes TicketSchema validation', () => {
    const raw: RawLivehelpnowTicket = {
      id: 99,
      title: 'Valid ticket',
      status: 'open',
      priority: 'high',
      source: 'email',
      email: 'customer@example.com',
      assigned_to: 5,
      department_id: '3',
      tags: ['billing'],
      created_time: '2026-01-15T09:30:00.000Z',
      updated_time: '2026-02-01T14:20:00.000Z',
    }
    const result = transformTicket(raw)
    expect(() => TicketSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifySmartsuppWebhook,
  parseSmartsuppWebhookEvents,
} from '../../../../../src/verticals/customer-support/adapters/smartsupp/webhook'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/smartsupp/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/smartsupp/transform/message'
import { transformTag } from '../../../../../src/verticals/customer-support/adapters/smartsupp/transform/tag'
import { SmartsuppAdapter } from '../../../../../src/verticals/customer-support/adapters/smartsupp/index'

describe('Smartsupp webhook', () => {
  it('verifies HMAC-SHA256 hex signature over raw body', () => {
    const secret = 'test-secret'
    const body = Buffer.from('{"event":"conversation.closed"}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifySmartsuppWebhook(body, { 'x-smartsupp-hmac': sig }, secret)).toBe(true)
  })

  it('rejects mismatched signature', () => {
    const body = Buffer.from('{}')
    expect(verifySmartsuppWebhook(body, { 'x-smartsupp-hmac': 'bad' }, 'secret')).toBe(false)
  })

  it('rejects empty signature headers', () => {
    expect(verifySmartsuppWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('handles mixed-case header names', () => {
    const secret = 'sec'
    const body = Buffer.from('hello')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifySmartsuppWebhook(body, { 'X-Smartsupp-Hmac': sig }, secret)).toBe(true)
  })

  it('parseEvents maps conversation.closed to tickets/closed', () => {
    const out = parseSmartsuppWebhookEvents({
      event: 'conversation.closed',
      data: { id: 'co123' },
    })
    expect(Array.isArray(out)).toBe(true)
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('smartsupp')
    expect(out[0]!.resourceType).toBe('tickets')
    expect(out[0]!.action).toBe('closed')
    expect(out[0]!.resourceId).toBe('co123')
  })

  it('parseEvents maps message.created to messages/commented', () => {
    const out = parseSmartsuppWebhookEvents({
      event: 'message.created',
      data: { id: 'ms1', conversation_id: 'co99' },
    })
    expect(out[0]!.resourceType).toBe('messages')
    expect(out[0]!.action).toBe('commented')
    expect(out[0]!.ticketId).toBe('co99')
  })

  it('parseEvents handles unknown event without throwing', () => {
    const out = parseSmartsuppWebhookEvents({ event: 'unknown.thing', data: {} })
    expect(Array.isArray(out)).toBe(true)
  })
})

describe('Smartsupp transformTicket', () => {
  it('maps a minimal conversation to canonical Ticket', () => {
    const raw = {
      id: 'co001',
      status: 'open',
      contact_id: 'ct1',
      created_at: '2024-01-01T00:00:00.000Z',
    }
    const ticket = transformTicket(raw)
    expect(ticket.id).toBe('co001')
    expect(ticket.platform).toBe('smartsupp')
    expect(ticket.status).toBe('open')
    expect(ticket.requesterId).toBe('ct1')
    expect(ticket.createdAt).toBe('2024-01-01T00:00:00.000Z')
  })

  it('maps status=closed and sets closedAt from finished_at', () => {
    const raw = {
      id: 'co002',
      status: 'closed',
      contact_id: 'ct2',
      finished_at: '2024-06-01T12:00:00.000Z',
      created_at: '2024-05-01T00:00:00.000Z',
    }
    const ticket = transformTicket(raw)
    expect(ticket.status).toBe('closed')
    expect(ticket.closedAt).toBe('2024-06-01T12:00:00.000Z')
    expect(ticket.resolvedAt).toBe('2024-06-01T12:00:00.000Z')
  })

  it('maps widget channel to chat', () => {
    const raw = { id: 'co003', channel: { type: 'widget' }, created_at: '2024-01-01T00:00:00.000Z' }
    const ticket = transformTicket(raw)
    expect(ticket.channel).toBe('chat')
  })

  it('maps email channel to email', () => {
    const raw = { id: 'co004', channel: { type: 'email' }, created_at: '2024-01-01T00:00:00.000Z' }
    const ticket = transformTicket(raw)
    expect(ticket.channel).toBe('email')
  })

  it('sets satisfactionRating from rating_value=5', () => {
    const raw = { id: 'co005', rating_value: 5, created_at: '2024-01-01T00:00:00.000Z' }
    const ticket = transformTicket(raw)
    expect(ticket.satisfactionRating).toBe(5)
  })

  it('does not throw when fields are null/undefined', () => {
    expect(() => transformTicket({ id: 'co006' })).not.toThrow()
  })
})

describe('Smartsupp transformMessage', () => {
  it('maps a minimal message to canonical Message', () => {
    const raw = {
      id: 'ms001',
      conversation_id: 'co001',
      sub_type: 'agent',
      agent_id: 'ag1',
      content: { type: 'text', text: 'Hello!' },
      created_at: '2024-01-01T00:00:00.000Z',
    }
    const msg = transformMessage(raw, 'co001')
    expect(msg.id).toBe('ms001')
    expect(msg.platform).toBe('smartsupp')
    expect(msg.ticketId).toBe('co001')
    expect(msg.authorType).toBe('user')
    expect(msg.body).toBe('Hello!')
  })

  it('maps sub_type=contact to authorType=contact', () => {
    const raw = {
      id: 'ms002',
      sub_type: 'contact',
      content: { type: 'text', text: 'Hi' },
      created_at: '2024-01-01T00:00:00.000Z',
    }
    const msg = transformMessage(raw, 'co002')
    expect(msg.authorType).toBe('contact')
  })

  it('maps type=note to internal message type', () => {
    const raw = {
      id: 'ms003',
      type: 'note',
      sub_type: 'agent',
      content: { type: 'text', text: 'Note' },
      created_at: '2024-01-01T00:00:00.000Z',
    }
    const msg = transformMessage(raw, 'co003')
    expect(msg.type).toBe('internal')
  })

  it('does not throw when content is missing', () => {
    expect(() => transformMessage({ id: 'ms004' }, 'co004')).not.toThrow()
  })
})

describe('Smartsupp transformTag', () => {
  it('maps a raw tag to canonical Tag', () => {
    const raw = { id: 'tg1', name: 'VIP', color: '#e53935', description: 'VIP customer' }
    const tag = transformTag(raw)
    expect(tag.id).toBe('tg1')
    expect(tag.name).toBe('VIP')
    expect(tag.color).toBe('#e53935')
    expect(tag.platform).toBe('smartsupp')
    expect(tag.metadata['description']).toBe('VIP customer')
  })
})

describe('SmartsuppAdapter.getTag stub', () => {
  it('throws a descriptive error about missing single-tag endpoint', async () => {
    const adapter = new SmartsuppAdapter()
    await expect(
      adapter.getTag({ accessToken: 'x', extra: {} }, 'tg1'),
    ).rejects.toThrow(/no single-tag endpoint|does not provide a single-tag endpoint/i)
  })
})

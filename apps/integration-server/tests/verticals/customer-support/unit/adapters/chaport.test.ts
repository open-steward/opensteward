import { describe, it, expect } from 'vitest'
import { transformContact, type RawChaportVisitor } from '../../../../../src/verticals/customer-support/adapters/chaport/transform/contact'
import { transformTicket, chaportTicketId, type RawChaportChat } from '../../../../../src/verticals/customer-support/adapters/chaport/transform/ticket'
import { transformMessage, type RawChaportChatEvent } from '../../../../../src/verticals/customer-support/adapters/chaport/transform/message'
import { transformUser, type RawChaportOperator } from '../../../../../src/verticals/customer-support/adapters/chaport/transform/user'
import { ChaportAdapter } from '../../../../../src/verticals/customer-support/adapters/chaport/index'

// ── transformContact ──────────────────────────────────────────────────────────

describe('transformContact', () => {
  it('maps a full visitor to a Contact with platform=chaport', () => {
    const raw: RawChaportVisitor = {
      id: 'v1',
      name: 'Alice',
      email: 'alice@example.com',
      phone: '+1-555-0100',
      widgetId: 'w1',
      sourceHost: 'example.com',
      language: 'en',
      lastSeen: '2026-01-01T10:00:00Z',
      location: 'US',
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('v1')
    expect(contact.externalId).toBe('v1')
    expect(contact.platform).toBe('chaport')
    expect(contact.email).toBe('alice@example.com')
    expect(contact.name).toBe('Alice')
    expect(contact.phone).toBe('+1-555-0100')
    expect(contact.metadata['widgetId']).toBe('w1')
    expect(contact.metadata['language']).toBe('en')
    expect(typeof contact.metadata['lastSeen']).toBe('string')
  })

  it('handles missing optional fields without throwing', () => {
    const raw: RawChaportVisitor = { id: 'v2' }
    const contact = transformContact(raw)
    expect(contact.id).toBe('v2')
    expect(contact.email).toBeUndefined()
    expect(contact.name).toBe('')
    expect(contact.phone).toBeUndefined()
  })
})

// ── transformTicket ───────────────────────────────────────────────────────────

describe('transformTicket / chaportTicketId', () => {
  it('chaportTicketId composes visitorId:chatId', () => {
    expect(chaportTicketId('v1', 'c1')).toBe('v1:c1')
    expect(chaportTicketId('v1', 42)).toBe('v1:42')
  })

  it('maps an open chat to a Ticket', () => {
    const raw: RawChaportChat = {
      id: 'c10',
      startedAt: '2026-01-01T10:00:00Z',
      stage: 'open',
      operators: ['op1'],
      assignedTeam: 'team-a',
      lastMessageAt: '2026-01-01T11:00:00Z',
      startPage: { url: 'https://example.com', title: 'Home' },
    }
    const ticket = transformTicket(raw, 'v1')
    expect(ticket.id).toBe('v1:c10')
    expect(ticket.externalId).toBe('c10')
    expect(ticket.platform).toBe('chaport')
    expect(ticket.status).toBe('open')
    expect(ticket.channel).toBe('chat')
    expect(ticket.requesterId).toBe('v1')
    expect(ticket.assigneeId).toBe('op1')
    expect(ticket.teamId).toBe('team-a')
    expect(ticket.subject).toBe('Home')
    expect(ticket.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(ticket.metadata['visitorId']).toBe('v1')
    expect(ticket.metadata['chatId']).toBe('c10')
  })

  it('maps a finished chat to status=closed with resolvedAt when lastMessageAt present', () => {
    const raw: RawChaportChat = { id: 'c11', stage: 'finished', lastMessageAt: '2026-01-01T12:00:00Z' }
    const ticket = transformTicket(raw, 'v2')
    expect(ticket.status).toBe('closed')
    expect(ticket.resolvedAt).toBeDefined()
    expect(ticket.resolvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('maps a resolved chat to status=resolved', () => {
    const raw: RawChaportChat = { id: 'c12', stage: 'resolved' }
    const ticket = transformTicket(raw, 'v3')
    expect(ticket.status).toBe('resolved')
  })

  it('uses fallback subject when startPage is absent', () => {
    const raw: RawChaportChat = { id: 'c13' }
    const ticket = transformTicket(raw, 'v4')
    expect(ticket.subject).toBe('Chat c13')
  })

  it('normalises satisfaction rating in 1-5 range', () => {
    const raw: RawChaportChat = { id: 'c14', rating: 4 }
    const ticket = transformTicket(raw, 'v5')
    expect(ticket.satisfactionRating).toBe(4)
  })

  it('ignores out-of-range rating', () => {
    const raw: RawChaportChat = { id: 'c15', rating: 0 }
    const ticket = transformTicket(raw, 'v6')
    expect(ticket.satisfactionRating).toBeUndefined()
  })
})

// ── transformMessage ──────────────────────────────────────────────────────────

describe('transformMessage', () => {
  it('maps a visitor-message event', () => {
    const raw: RawChaportChatEvent = {
      type: 'visitor-message',
      timestamp: '2026-01-01T12:00:00Z',
      params: { text: 'Hello!', externalId: 'ext-1' },
    }
    const msg = transformMessage(raw, 'v1', 'c1', 0)
    expect(msg.platform).toBe('chaport')
    expect(msg.ticketId).toBe('v1:c1')
    expect(msg.authorType).toBe('contact')
    expect(msg.authorId).toBe('v1')
    expect(msg.body).toBe('Hello!')
    expect(msg.type).toBe('public')
    expect(msg.externalId).toBe('ext-1')
    expect(msg.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('maps an operator-message event', () => {
    const raw: RawChaportChatEvent = {
      type: 'operator-message',
      timestamp: '2026-01-01T12:01:00Z',
      params: { text: 'Hi there!', operatorId: 'op1' },
    }
    const msg = transformMessage(raw, 'v1', 'c1', 1)
    expect(msg.authorType).toBe('user')
    expect(msg.authorId).toBe('op1')
    expect(msg.type).toBe('public')
  })

  it('maps a system-message event to internal type', () => {
    const raw: RawChaportChatEvent = {
      type: 'system-message',
      timestamp: '2026-01-01T12:02:00Z',
      params: { text: 'Chat started' },
    }
    const msg = transformMessage(raw, 'v1', 'c1', 2)
    expect(msg.type).toBe('internal')
    expect(msg.authorType).toBe('system')
  })

  it('falls back to epoch ISO when timestamp is absent', () => {
    const raw: RawChaportChatEvent = { type: 'visitor-message' }
    const msg = transformMessage(raw, 'v1', 'c1', 0)
    expect(msg.createdAt).toBe(new Date(0).toISOString())
    expect(msg.body).toBe('')
  })
})

// ── transformUser ─────────────────────────────────────────────────────────────

describe('transformUser', () => {
  it('maps a full operator to a User with platform=chaport', () => {
    const raw: RawChaportOperator = {
      id: 'op1',
      email: 'op@example.com',
      name: 'Bob',
      role: 'admin',
      jobTitle: 'Manager',
      language: 'en',
      lastStatus: 'online',
      realStatus: 'online',
      lastLoginAt: '2026-01-01T08:00:00Z',
      lastActivityAt: '2026-01-01T09:00:00Z',
    }
    const user = transformUser(raw)
    expect(user.id).toBe('op1')
    expect(user.externalId).toBe('op1')
    expect(user.platform).toBe('chaport')
    expect(user.email).toBe('op@example.com')
    expect(user.name).toBe('Bob')
    expect(user.role).toBe('admin')
    expect(user.metadata['jobTitle']).toBe('Manager')
    expect(user.metadata['lastStatus']).toBe('online')
    expect(typeof user.metadata['lastLoginAt']).toBe('string')
  })

  it('handles missing optional fields without throwing', () => {
    const raw: RawChaportOperator = { id: 'op2' }
    const user = transformUser(raw)
    expect(user.id).toBe('op2')
    expect(user.name).toBe('')
    expect(user.email).toBeUndefined()
  })
})

// ── ChaportAdapter.parseWebhookEvents ─────────────────────────────────────────

describe('ChaportAdapter.parseWebhookEvents', () => {
  const adapter = new ChaportAdapter()

  it('maps visitor.created to contacts/created', () => {
    const events = adapter.parseWebhookEvents({ event: 'visitor.created', data: { visitorId: 'v1' } })
    expect(Array.isArray(events)).toBe(true)
    expect(events[0]!.platform).toBe('chaport')
    expect(events[0]!.resourceType).toBe('contacts')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.resourceId).toBe('v1')
  })

  it('maps chat.started to tickets/created with composed id', () => {
    const events = adapter.parseWebhookEvents({ event: 'chat.started', data: { visitorId: 'v1', chatId: 'c1' } })
    expect(events[0]!.resourceType).toBe('tickets')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.resourceId).toBe('v1:c1')
  })

  it('maps chat.finished to tickets/resolved', () => {
    const events = adapter.parseWebhookEvents({ event: 'chat.finished', data: { visitorId: 'v2', chatId: 'c2' } })
    expect(events[0]!.action).toBe('resolved')
  })

  it('maps chat.newEvent.visitor-message to messages/commented', () => {
    const events = adapter.parseWebhookEvents({ event: 'chat.newEvent.visitor-message', data: { visitorId: 'v3', chatId: 'c3' } })
    expect(events[0]!.resourceType).toBe('messages')
    expect(events[0]!.action).toBe('commented')
    expect(events[0]!.ticketId).toBe('v3:c3')
  })

  it('handles unknown event without throwing', () => {
    const events = adapter.parseWebhookEvents({ event: 'some.unknown.event', data: {} })
    expect(Array.isArray(events)).toBe(true)
    expect(events[0]!.resourceType).toBe('unknown')
    expect(events[0]!.action).toBe('unknown')
  })

  it('handles non-string event field without throwing', () => {
    const events = adapter.parseWebhookEvents({ event: null })
    expect(Array.isArray(events)).toBe(true)
  })

  it('handles completely empty payload without throwing', () => {
    const events = adapter.parseWebhookEvents({})
    expect(Array.isArray(events)).toBe(true)
  })
})

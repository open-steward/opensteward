import { describe, it, expect } from 'vitest'
import { verifyFreshchatWebhook, parseFreshchatWebhookEvents } from '../../../../../src/verticals/customer-support/adapters/freshchat/webhook'
import { transformTicket, type RawFreshchatConversation } from '../../../../../src/verticals/customer-support/adapters/freshchat/transform/ticket'
import { transformMessage, type RawFreshchatMessage } from '../../../../../src/verticals/customer-support/adapters/freshchat/transform/message'
import { transformContact, type RawFreshchatUser } from '../../../../../src/verticals/customer-support/adapters/freshchat/transform/contact'

describe('Freshchat webhook', () => {
  it('rejects missing signature header', () => {
    expect(verifyFreshchatWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('rejects empty signature string', () => {
    expect(verifyFreshchatWebhook(Buffer.from('{}'), { 'x-freshchat-signature': '' }, 'secret')).toBe(false)
  })

  it('returns false on invalid RSA signature (does not throw)', () => {
    const result = verifyFreshchatWebhook(
      Buffer.from('{}'),
      { 'x-freshchat-signature': Buffer.from('badsig').toString('base64') },
      'not-a-pem-key',
    )
    expect(result).toBe(false)
  })

  it('parseWebhookEvents returns array with platform=freshchat for message_create', () => {
    const out = parseFreshchatWebhookEvents({
      action: 'message_create',
      data: { message: { id: 'msg1', conversation_id: 'conv1' } },
    })
    expect(Array.isArray(out)).toBe(true)
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('freshchat')
    expect(out[0]!.resourceType).toBe('messages')
    expect(out[0]!.action).toBe('commented')
  })

  it('parseWebhookEvents handles conversation_resolution', () => {
    const out = parseFreshchatWebhookEvents({
      action: 'conversation_resolution',
      data: { conversation: { conversation_id: 'conv42' } },
    })
    expect(out[0]!.resourceType).toBe('tickets')
    expect(out[0]!.action).toBe('updated')
    expect(out[0]!.ticketId).toBe('conv42')
  })

  it('parseWebhookEvents handles unknown action gracefully', () => {
    const out = parseFreshchatWebhookEvents({ action: 'unknown_action', data: {} })
    expect(Array.isArray(out)).toBe(true)
    expect(out[0]!.platform).toBe('freshchat')
  })
})

describe('Freshchat transform: ticket', () => {
  const raw: RawFreshchatConversation = {
    conversation_id: 'conv-1',
    status: 'assigned',
    assigned_agent_id: 'agent-1',
    assigned_group_id: 'group-1',
    users: [{ id: 'user-1' }],
    messages: [
      { message_parts: [{ text: { content: 'Hello, I need help' } }] },
    ],
    created_time: '2024-01-15T10:00:00Z',
    updated_time: '2024-01-15T11:00:00Z',
    channel_id: 'ch-1',
    app_id: 'app-1',
  }

  it('sets platform to freshchat', () => {
    const ticket = transformTicket(raw)
    expect(ticket.platform).toBe('freshchat')
  })

  it('maps status=assigned to open', () => {
    const ticket = transformTicket(raw)
    expect(ticket.status).toBe('open')
  })

  it('maps status=resolved correctly', () => {
    const ticket = transformTicket({ ...raw, status: 'resolved' })
    expect(ticket.status).toBe('resolved')
    expect(ticket.resolvedAt).toBeDefined()
  })

  it('sets correct ids', () => {
    const ticket = transformTicket(raw)
    expect(ticket.id).toBe('conv-1')
    expect(ticket.externalId).toBe('conv-1')
    expect(ticket.requesterId).toBe('user-1')
    expect(ticket.assigneeId).toBe('agent-1')
    expect(ticket.teamId).toBe('group-1')
  })

  it('extracts first message as subject', () => {
    const ticket = transformTicket(raw)
    expect(ticket.subject).toContain('Hello, I need help')
  })

  it('returns ISO-8601 datetimes', () => {
    const ticket = transformTicket(raw)
    expect(ticket.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('sets metadata with appId and channelId', () => {
    const ticket = transformTicket(raw)
    expect(ticket.metadata).toMatchObject({ appId: 'app-1', channelId: 'ch-1' })
  })

  it('handles missing users gracefully', () => {
    const ticket = transformTicket({ ...raw, users: undefined })
    expect(ticket.requesterId).toBe('')
  })
})

describe('Freshchat transform: message', () => {
  const raw: RawFreshchatMessage = {
    id: 'msg-1',
    conversation_id: 'conv-1',
    actor_type: 'agent',
    actor_id: 'agent-1',
    message_type: 'normal',
    message_parts: [{ text: { content: 'How can I help?' } }],
    created_time: '2024-01-15T10:05:00Z',
  }

  it('sets platform to freshchat', () => {
    const msg = transformMessage(raw, 'conv-1')
    expect(msg.platform).toBe('freshchat')
  })

  it('maps agent actor_type to agent authorType', () => {
    const msg = transformMessage(raw, 'conv-1')
    expect(msg.authorType).toBe('agent')
  })

  it('maps user actor_type to user authorType', () => {
    const msg = transformMessage({ ...raw, actor_type: 'user' }, 'conv-1')
    expect(msg.authorType).toBe('user')
  })

  it('maps private message_type to internal', () => {
    const msg = transformMessage({ ...raw, message_type: 'private' }, 'conv-1')
    expect(msg.type).toBe('internal')
  })

  it('extracts text from message_parts', () => {
    const msg = transformMessage(raw, 'conv-1')
    expect(msg.body).toBe('How can I help?')
  })

  it('returns ISO-8601 createdAt', () => {
    const msg = transformMessage(raw, 'conv-1')
    expect(msg.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('sets ticketId to conversationId', () => {
    const msg = transformMessage(raw, 'conv-99')
    expect(msg.ticketId).toBe('conv-99')
  })
})

describe('Freshchat transform: contact', () => {
  const raw: RawFreshchatUser = {
    id: 'user-1',
    email: 'alice@example.com',
    first_name: 'Alice',
    last_name: 'Smith',
    phone: '+1234567890',
    created_time: '2024-01-01T00:00:00Z',
  }

  it('sets platform to freshchat', () => {
    const contact = transformContact(raw)
    expect(contact.platform).toBe('freshchat')
  })

  it('builds full name from first + last', () => {
    const contact = transformContact(raw)
    expect(contact.name).toBe('Alice Smith')
  })

  it('maps email and phone', () => {
    const contact = transformContact(raw)
    expect(contact.email).toBe('alice@example.com')
    expect(contact.phone).toBe('+1234567890')
  })

  it('handles null phone gracefully', () => {
    const contact = transformContact({ ...raw, phone: null })
    expect(contact.phone).toBeUndefined()
  })
})

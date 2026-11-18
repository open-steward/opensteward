import { describe, it, expect } from 'vitest'
import { verifyPapercupsWebhook, parsePapercupsWebhookEvents } from '../../../../../src/verticals/customer-support/adapters/papercups/webhook'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/papercups/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/papercups/transform/message'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/papercups/transform/contact'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/papercups/transform/user'

describe('Papercups verifyWebhook', () => {
  it('always returns true (no HMAC signature scheme)', () => {
    expect(verifyPapercupsWebhook(Buffer.from('{}'), {}, 'any-secret')).toBe(true)
  })

  it('returns true even when headers and secret are empty', () => {
    expect(verifyPapercupsWebhook(Buffer.from(''), {}, '')).toBe(true)
  })
})

describe('Papercups parsePapercupsWebhookEvents', () => {
  it('returns empty array for webhook:verify challenge', () => {
    const out = parsePapercupsWebhookEvents({ event: 'webhook:verify', payload: 'ABCXYZ' })
    expect(out).toEqual([])
  })

  it('maps message:created to messages/commented with ticketId', () => {
    const out = parsePapercupsWebhookEvents({
      event: 'message:created',
      payload: { id: 'msg1', conversation_id: 'conv99' },
    })
    expect(out).toHaveLength(1)
    expect(out[0]!.platform).toBe('papercups')
    expect(out[0]!.resourceType).toBe('messages')
    expect(out[0]!.action).toBe('commented')
    expect(out[0]!.resourceId).toBe('msg1')
    expect(out[0]!.ticketId).toBe('conv99')
  })

  it('maps conversation:created to tickets/created', () => {
    const out = parsePapercupsWebhookEvents({
      event: 'conversation:created',
      payload: { id: 'conv1' },
    })
    expect(out).toHaveLength(1)
    expect(out[0]!.resourceType).toBe('tickets')
    expect(out[0]!.action).toBe('created')
    expect(out[0]!.resourceId).toBe('conv1')
    expect(out[0]!.ticketId).toBeUndefined()
  })

  it('maps conversation:updated to tickets/updated', () => {
    const out = parsePapercupsWebhookEvents({
      event: 'conversation:updated',
      payload: { id: 'conv2' },
    })
    expect(out[0]!.resourceType).toBe('tickets')
    expect(out[0]!.action).toBe('updated')
  })

  it('maps customer:created to contacts/created', () => {
    const out = parsePapercupsWebhookEvents({
      event: 'customer:created',
      payload: { id: 'cust1' },
    })
    expect(out[0]!.resourceType).toBe('contacts')
    expect(out[0]!.action).toBe('created')
    expect(out[0]!.resourceId).toBe('cust1')
  })

  it('handles unknown event without throwing', () => {
    const out = parsePapercupsWebhookEvents({ event: 'something:else', payload: { id: 'x' } })
    expect(Array.isArray(out)).toBe(true)
    expect(out).toHaveLength(1)
    expect(out[0]!.resourceType).toBe('unknown')
    expect(out[0]!.action).toBe('unknown')
  })

  it('does not throw when payload is missing', () => {
    expect(() => parsePapercupsWebhookEvents({ event: 'conversation:created' })).not.toThrow()
  })
})

describe('Papercups transformTicket', () => {
  it('maps a minimal conversation to canonical Ticket', () => {
    const raw = {
      id: 'conv001',
      status: 'open',
      customer_id: 'cust1',
      created_at: '2024-01-01T00:00:00.000Z',
    }
    const ticket = transformTicket(raw)
    expect(ticket.id).toBe('conv001')
    expect(ticket.externalId).toBe('conv001')
    expect(ticket.platform).toBe('papercups')
    expect(ticket.status).toBe('open')
    expect(ticket.requesterId).toBe('cust1')
    expect(ticket.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(Array.isArray(ticket.tagIds)).toBe(true)
  })

  it('maps status=closed and sets closedAt/resolvedAt', () => {
    const raw = {
      id: 'conv002',
      status: 'closed',
      customer_id: 'cust2',
      closed_at: '2024-06-01T12:00:00.000Z',
      created_at: '2024-05-01T00:00:00.000Z',
    }
    const ticket = transformTicket(raw)
    expect(ticket.status).toBe('closed')
    expect(ticket.closedAt).toBe('2024-06-01T12:00:00.000Z')
    expect(ticket.resolvedAt).toBe('2024-06-01T12:00:00.000Z')
  })

  it('maps priority=not_urgent to canonical low', () => {
    const ticket = transformTicket({ id: 'c1', priority: 'not_urgent', created_at: '2024-01-01T00:00:00.000Z' })
    expect(ticket.priority).toBe('low')
  })

  it('maps priority=low to canonical low', () => {
    const ticket = transformTicket({ id: 'c2', priority: 'low', created_at: '2024-01-01T00:00:00.000Z' })
    expect(ticket.priority).toBe('low')
  })

  it('maps priority=medium to canonical normal', () => {
    const ticket = transformTicket({ id: 'c3', priority: 'medium', created_at: '2024-01-01T00:00:00.000Z' })
    expect(ticket.priority).toBe('normal')
  })

  it('maps priority=high to canonical high', () => {
    const ticket = transformTicket({ id: 'c4', priority: 'high', created_at: '2024-01-01T00:00:00.000Z' })
    expect(ticket.priority).toBe('high')
  })

  it('maps priority=urgent to canonical urgent', () => {
    const ticket = transformTicket({ id: 'c5', priority: 'urgent', created_at: '2024-01-01T00:00:00.000Z' })
    expect(ticket.priority).toBe('urgent')
  })

  it('returns undefined priority for null/unknown priority values', () => {
    const t1 = transformTicket({ id: 'c6', priority: null, created_at: '2024-01-01T00:00:00.000Z' })
    expect(t1.priority).toBeUndefined()
    const t2 = transformTicket({ id: 'c7', priority: 'normal', created_at: '2024-01-01T00:00:00.000Z' })
    expect(t2.priority).toBeUndefined()
  })

  it('maps source=email to channel=email', () => {
    const ticket = transformTicket({ id: 'c8', source: 'email', created_at: '2024-01-01T00:00:00.000Z' })
    expect(ticket.channel).toBe('email')
  })

  it('maps source=widget to channel=chat', () => {
    const ticket = transformTicket({ id: 'c9', source: 'widget', created_at: '2024-01-01T00:00:00.000Z' })
    expect(ticket.channel).toBe('chat')
  })

  it('maps source=sms to channel=sms', () => {
    const ticket = transformTicket({ id: 'c10', source: 'sms', created_at: '2024-01-01T00:00:00.000Z' })
    expect(ticket.channel).toBe('sms')
  })

  it('maps source=api to channel=api', () => {
    const ticket = transformTicket({ id: 'c11', source: 'api', created_at: '2024-01-01T00:00:00.000Z' })
    expect(ticket.channel).toBe('api')
  })

  it('maps assignee_id correctly', () => {
    const ticket = transformTicket({ id: 'c12', assignee_id: 'agent1', created_at: '2024-01-01T00:00:00.000Z' })
    expect(ticket.assigneeId).toBe('agent1')
  })

  it('does not throw when all optional fields are absent', () => {
    expect(() => transformTicket({ id: 'c_min' })).not.toThrow()
  })

  it('metadata is a flat string record', () => {
    const ticket = transformTicket({ id: 'c13', source: 'chat', read: true, account_id: 'acc1', created_at: '2024-01-01T00:00:00.000Z' })
    expect(typeof ticket.metadata).toBe('object')
    expect(ticket.metadata['source']).toBe('chat')
    expect(ticket.metadata['accountId']).toBe('acc1')
  })
})

describe('Papercups transformMessage', () => {
  it('maps a minimal agent message to canonical Message', () => {
    const raw = {
      id: 'msg001',
      conversation_id: 'conv001',
      body: 'Hello customer!',
      user_id: 'agent1',
      created_at: '2024-01-01T00:00:00.000Z',
    }
    const msg = transformMessage(raw, 'conv001')
    expect(msg.id).toBe('msg001')
    expect(msg.externalId).toBe('msg001')
    expect(msg.platform).toBe('papercups')
    expect(msg.ticketId).toBe('conv001')
    expect(msg.authorId).toBe('agent1')
    expect(msg.authorType).toBe('user')
    expect(msg.body).toBe('Hello customer!')
    expect(msg.type).toBe('public')
  })

  it('maps customer_id present (no user_id) to authorType=contact', () => {
    const raw = {
      id: 'msg002',
      conversation_id: 'conv001',
      body: 'Hi there',
      customer_id: 'cust1',
      created_at: '2024-01-01T00:00:00.000Z',
    }
    const msg = transformMessage(raw, 'conv001')
    expect(msg.authorType).toBe('contact')
    expect(msg.authorId).toBe('cust1')
  })

  it('maps private=true to type=internal', () => {
    const raw = {
      id: 'msg003',
      private: true,
      body: 'Internal note',
      user_id: 'agent2',
      created_at: '2024-01-01T00:00:00.000Z',
    }
    const msg = transformMessage(raw, 'conv001')
    expect(msg.type).toBe('internal')
  })

  it('counts attachments correctly', () => {
    const raw = {
      id: 'msg004',
      body: 'See attachments',
      attachments: [{ id: 'a1', file_name: 'doc.pdf' }, { id: 'a2', file_name: 'img.png' }],
      created_at: '2024-01-01T00:00:00.000Z',
    }
    const msg = transformMessage(raw, 'conv001')
    expect(msg.attachmentCount).toBe(2)
  })

  it('does not throw when optional fields are absent', () => {
    expect(() => transformMessage({ id: 'msg_min' }, 'conv_min')).not.toThrow()
  })
})

describe('Papercups transformContact', () => {
  it('maps a full customer to canonical Contact', () => {
    const raw = {
      id: 'cust001',
      external_id: 'ext_abc',
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+1-555-0100',
      company: { id: 'co1', name: 'Acme Corp' },
      created_at: '2024-01-01T00:00:00.000Z',
    }
    const contact = transformContact(raw)
    expect(contact.id).toBe('cust001')
    expect(contact.externalId).toBe('ext_abc')
    expect(contact.name).toBe('Jane Doe')
    expect(contact.email).toBe('jane@example.com')
    expect(contact.phone).toBe('+1-555-0100')
    expect(contact.organizationId).toBe('co1')
    expect(contact.platform).toBe('papercups')
    expect(contact.metadata['companyName']).toBe('Acme Corp')
  })

  it('falls back externalId to id when external_id is absent', () => {
    const contact = transformContact({ id: 'cust002' })
    expect(contact.externalId).toBe('cust002')
  })

  it('does not throw when all optional fields are absent', () => {
    expect(() => transformContact({ id: 'cust_min' })).not.toThrow()
  })
})

describe('Papercups transformUser', () => {
  it('maps a full user to canonical User', () => {
    const raw = {
      id: 'user001',
      account_id: 'acc1',
      email: 'agent@example.com',
      full_name: 'Alice Agent',
      display_name: 'Alice',
      role: 'admin',
    }
    const user = transformUser(raw)
    expect(user.id).toBe('user001')
    expect(user.externalId).toBe('user001')
    expect(user.email).toBe('agent@example.com')
    expect(user.name).toBe('Alice Agent')
    expect(user.role).toBe('admin')
    expect(user.platform).toBe('papercups')
    expect(user.teamIds).toEqual([])
    expect(user.metadata['accountId']).toBe('acc1')
  })

  it('falls back name to display_name then email', () => {
    const u1 = transformUser({ id: 'u2', display_name: 'Bob', email: 'b@x.com' })
    expect(u1.name).toBe('Bob')
    const u2 = transformUser({ id: 'u3', email: 'c@x.com' })
    expect(u2.name).toBe('c@x.com')
  })

  it('does not throw when all optional fields are absent', () => {
    expect(() => transformUser({ id: 'user_min' })).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyUnthreadWebhook, parseUnthreadWebhookEvents } from '../../../../../src/verticals/customer-support/adapters/unthread/webhook'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/unthread/transform/ticket'
import { transformTag } from '../../../../../src/verticals/customer-support/adapters/unthread/transform/tag'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/unthread/transform/contact'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/unthread/transform/user'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/unthread/transform/team'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/unthread/transform/message'

describe('Unthread webhook verification', () => {
  it('verifies HMAC-SHA256 hex over raw body', () => {
    const secret = 'test-secret'
    const body = Buffer.from('{"event":"conversation_created"}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyUnthreadWebhook(body, { 'x-unthread-signature': sig }, secret)).toBe(true)
  })

  it('verifies with original-case header X-Unthread-Signature', () => {
    const secret = 'test-secret'
    const body = Buffer.from('{"event":"conversation_created"}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyUnthreadWebhook(body, { 'X-Unthread-Signature': sig }, secret)).toBe(true)
  })

  it('rejects wrong signature', () => {
    const body = Buffer.from('{}')
    expect(verifyUnthreadWebhook(body, { 'x-unthread-signature': 'badhex' }, 'secret')).toBe(false)
  })

  it('rejects missing signature header', () => {
    expect(verifyUnthreadWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })
})

describe('Unthread webhook event parsing', () => {
  it('maps conversation_created to tickets/created', () => {
    const events = parseUnthreadWebhookEvents({
      event: 'conversation_created',
      eventId: 'evt-1',
      data: { id: 'conv-1' },
    })
    expect(events).toHaveLength(1)
    expect(events[0]!.platform).toBe('unthread')
    expect(events[0]!.resourceType).toBe('tickets')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.resourceId).toBe('conv-1')
  })

  it('maps message_created to messages/commented and sets ticketId', () => {
    const events = parseUnthreadWebhookEvents({
      event: 'message_created',
      eventId: 'evt-2',
      data: { id: 'msg-1', conversationId: 'conv-2' },
    })
    expect(events[0]!.resourceType).toBe('messages')
    expect(events[0]!.action).toBe('commented')
    expect(events[0]!.ticketId).toBe('conv-2')
  })

  it('handles unknown event type without throwing', () => {
    const events = parseUnthreadWebhookEvents({ event: 'unknown_event', data: { id: 'x' } })
    expect(Array.isArray(events)).toBe(true)
    expect(events[0]!.platform).toBe('unthread')
  })
})

describe('Unthread transformTicket', () => {
  it('maps open slack conversation', () => {
    const out = transformTicket({
      id: 'conv-1',
      friendlyId: 'T-123',
      title: 'Need help',
      status: 'open',
      type: 'slack',
      customerId: 'cust-1',
      assignedToUserId: 'user-1',
      tags: [{ id: 'tag-1', name: 'billing' }],
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-16T10:00:00Z',
    })
    expect(out.id).toBe('conv-1')
    expect(out.platform).toBe('unthread')
    expect(out.status).toBe('open')
    expect(out.channel).toBe('chat')
    expect(out.number).toBe('T-123')
    expect(out.requesterId).toBe('cust-1')
    expect(out.assigneeId).toBe('user-1')
    expect(out.tagIds).toContain('tag-1')
    expect(out.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('maps closed email conversation', () => {
    const out = transformTicket({
      id: 'conv-2',
      status: 'closed',
      type: 'email',
      closedAt: '2024-02-01T00:00:00Z',
      createdAt: '2024-01-01T00:00:00Z',
    })
    expect(out.status).toBe('closed')
    expect(out.channel).toBe('email')
    expect(out.closedAt).toBeTruthy()
  })

  it('maps in_progress status', () => {
    const out = transformTicket({ id: 'c3', status: 'in_progress', createdAt: '2024-01-01T00:00:00Z' })
    expect(out.status).toBe('in_progress')
  })

  it('defaults unknown status to open', () => {
    const out = transformTicket({ id: 'c4', status: 'weird_value', createdAt: '2024-01-01T00:00:00Z' })
    expect(out.status).toBe('open')
  })

  it('does not throw on minimal input', () => {
    expect(() => transformTicket({ id: 'c5', createdAt: null })).not.toThrow()
  })

  it('sets metadata with type and channelId', () => {
    const out = transformTicket({ id: 'c6', type: 'triage', channelId: 'ch-1', createdAt: '2024-01-01T00:00:00Z' })
    expect(out.metadata['type']).toBe('triage')
    expect(out.metadata['channelId']).toBe('ch-1')
  })
})

describe('Unthread transformTag', () => {
  it('maps tag fields', () => {
    const out = transformTag({
      id: 'tag-1',
      name: 'billing',
      description: 'Billing issues',
      autoTaggingEnabled: true,
      projectId: 'proj-1',
    })
    expect(out.id).toBe('tag-1')
    expect(out.name).toBe('billing')
    expect(out.platform).toBe('unthread')
    expect(out.metadata['description']).toBe('Billing issues')
    expect(out.metadata['autoTaggingEnabled']).toBe('true')
    expect(out.raw).toBeDefined()
  })

  it('handles minimal tag', () => {
    const out = transformTag({ id: 'tag-2' })
    expect(out.name).toBe('')
    expect(out.platform).toBe('unthread')
  })
})

describe('Unthread transformContact', () => {
  it('maps customer fields', () => {
    const out = transformContact({
      id: 'cust-1',
      name: 'Acme Corp',
      emailDomains: ['acme.com', 'acme.io'],
      slackChannelId: 'C123',
      projectId: 'proj-1',
    })
    expect(out.id).toBe('cust-1')
    expect(out.name).toBe('Acme Corp')
    expect(out.platform).toBe('unthread')
    expect(out.organizationId).toBe('proj-1')
    expect(out.metadata['emailDomains']).toBe('acme.com,acme.io')
    expect(out.metadata['slackChannelId']).toBe('C123')
  })

  it('handles minimal customer', () => {
    const out = transformContact({ id: 'cust-2' })
    expect(out.name).toBe('')
    expect(out.email).toBeUndefined()
  })
})

describe('Unthread transformUser', () => {
  it('maps user fields', () => {
    const out = transformUser({
      id: 'user-1',
      name: 'Alice Smith',
      email: 'alice@example.com',
      slackId: 'U123',
    })
    expect(out.id).toBe('user-1')
    expect(out.name).toBe('Alice Smith')
    expect(out.email).toBe('alice@example.com')
    expect(out.platform).toBe('unthread')
    expect(out.metadata['slackId']).toBe('U123')
  })

  it('handles user without email', () => {
    const out = transformUser({ id: 'user-2', name: 'Bob' })
    expect(out.email).toBeUndefined()
    expect(out.teamIds).toEqual([])
  })
})

describe('Unthread transformTeam', () => {
  it('uses description as name', () => {
    const out = transformTeam({ id: 'grp-1', description: 'Support Team', projectId: 'proj-1' })
    expect(out.name).toBe('Support Team')
    expect(out.platform).toBe('unthread')
    expect(out.metadata['projectId']).toBe('proj-1')
  })

  it('falls back to id when description is absent', () => {
    const out = transformTeam({ id: 'grp-2' })
    expect(out.name).toBe('grp-2')
  })
})

describe('Unthread transformMessage', () => {
  it('maps agent message', () => {
    const out = transformMessage({
      id: 'msg-1',
      conversationId: 'conv-1',
      text: 'Hello there',
      senderUserId: 'user-1',
      isPrivateNote: false,
      createdAt: '2024-01-15T12:00:00Z',
    }, 'conv-1')
    expect(out.id).toBe('msg-1')
    expect(out.ticketId).toBe('conv-1')
    expect(out.body).toBe('Hello there')
    expect(out.type).toBe('public')
    expect(out.authorType).toBe('user')
    expect(out.authorId).toBe('user-1')
    expect(out.platform).toBe('unthread')
    expect(out.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('maps private note from customer', () => {
    const out = transformMessage({
      id: 'msg-2',
      conversationId: 'conv-1',
      text: 'Internal note',
      isPrivateNote: true,
      customerId: 'cust-1',
      createdAt: '2024-01-16T08:00:00Z',
    }, 'conv-1')
    expect(out.type).toBe('internal')
    expect(out.authorType).toBe('contact')
    expect(out.authorId).toBe('cust-1')
  })

  it('handles structured body object', () => {
    const out = transformMessage({
      id: 'msg-3',
      body: { type: 'text', value: 'Structured body content' },
      createdAt: '2024-01-17T00:00:00Z',
    }, 'conv-1')
    expect(out.body).toBe('Structured body content')
  })

  it('does not throw on empty message', () => {
    expect(() => transformMessage({ id: 'msg-4', createdAt: null }, 'conv-1')).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyPylonWebhook,
  parsePylonWebhookEvents,
  PylonWebhookHandler,
} from '../../../../../src/verticals/customer-support/adapters/gorgias-aircall/webhook'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/gorgias-aircall/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/gorgias-aircall/transform/message'
import { transformContact } from '../../../../../src/verticals/customer-support/adapters/gorgias-aircall/transform/contact'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/gorgias-aircall/transform/user'
import { transformTag } from '../../../../../src/verticals/customer-support/adapters/gorgias-aircall/transform/tag'
import { transformTeam } from '../../../../../src/verticals/customer-support/adapters/gorgias-aircall/transform/team'
import { transformMacro } from '../../../../../src/verticals/customer-support/adapters/gorgias-aircall/transform/macro'

// ── Webhook verification ──────────────────────────────────────────────────────

describe('verifyPylonWebhook', () => {
  const secret = 'test-secret'
  const body = Buffer.from('{"type":"issue.created"}')
  const ts = '1700000000'

  function makeSig(timestamp: string, bodyBuf: Buffer, sec: string): string {
    return 'hs256=' + createHmac('sha256', sec).update(`${timestamp}.${bodyBuf.toString('utf8')}`).digest('hex')
  }

  it('verifies valid HMAC-SHA256 hs256= signature', () => {
    const sig = makeSig(ts, body, secret)
    expect(
      verifyPylonWebhook(body, {
        'pylon-webhook-signature': sig,
        'pylon-webhook-timestamp': ts,
      }, secret),
    ).toBe(true)
  })

  it('verifies with original-case headers', () => {
    const sig = makeSig(ts, body, secret)
    expect(
      verifyPylonWebhook(body, {
        'Pylon-Webhook-Signature': sig,
        'Pylon-Webhook-Timestamp': ts,
      }, secret),
    ).toBe(true)
  })

  it('verifies signature without hs256= prefix', () => {
    const sig = createHmac('sha256', secret).update(`${ts}.${body.toString('utf8')}`).digest('hex')
    expect(
      verifyPylonWebhook(body, {
        'pylon-webhook-signature': sig,
        'pylon-webhook-timestamp': ts,
      }, secret),
    ).toBe(true)
  })

  it('rejects wrong secret', () => {
    const sig = makeSig(ts, body, 'wrong-secret')
    expect(
      verifyPylonWebhook(body, {
        'pylon-webhook-signature': sig,
        'pylon-webhook-timestamp': ts,
      }, secret),
    ).toBe(false)
  })

  it('rejects missing signature header', () => {
    expect(verifyPylonWebhook(body, { 'pylon-webhook-timestamp': ts }, secret)).toBe(false)
  })

  it('rejects missing timestamp header', () => {
    const sig = makeSig(ts, body, secret)
    expect(verifyPylonWebhook(body, { 'pylon-webhook-signature': sig }, secret)).toBe(false)
  })

  it('rejects empty headers', () => {
    expect(verifyPylonWebhook(body, {}, secret)).toBe(false)
  })
})

describe('PylonWebhookHandler object', () => {
  it('exposes verifyWebhook and parseWebhookEvents', () => {
    expect(typeof PylonWebhookHandler.verifyWebhook).toBe('function')
    expect(typeof PylonWebhookHandler.parseWebhookEvents).toBe('function')
  })
})

// ── Webhook event parsing ─────────────────────────────────────────────────────

describe('parsePylonWebhookEvents', () => {
  it('maps issue.created to tickets/created', () => {
    const events = parsePylonWebhookEvents({ type: 'issue.created', data: { id: 'iss-1' } })
    expect(events).toHaveLength(1)
    expect(events[0]!.platform).toBe('gorgias-aircall')
    expect(events[0]!.resourceType).toBe('tickets')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.resourceId).toBe('iss-1')
  })

  it('maps issue.message.created to messages/commented with ticketId', () => {
    const events = parsePylonWebhookEvents({
      type: 'issue.message.created',
      data: { id: 'msg-1', issue_id: 'iss-2' },
    })
    expect(events[0]!.resourceType).toBe('messages')
    expect(events[0]!.action).toBe('commented')
    expect(events[0]!.ticketId).toBe('iss-2')
  })

  it('maps contact.created to contacts/created', () => {
    const events = parsePylonWebhookEvents({ type: 'contact.created', data: { id: 'c-1' } })
    expect(events[0]!.resourceType).toBe('contacts')
    expect(events[0]!.action).toBe('created')
  })

  it('handles unknown event type without throwing', () => {
    const events = parsePylonWebhookEvents({ type: 'unknown_event', data: { id: 'x' } })
    expect(Array.isArray(events)).toBe(true)
    expect(events[0]!.platform).toBe('gorgias-aircall')
  })

  it('falls back to event_type field', () => {
    const events = parsePylonWebhookEvents({ event_type: 'issue.updated', data: { id: 'iss-3' } })
    expect(events[0]!.type).toBe('issue.updated')
  })

  it('does not throw on empty payload', () => {
    expect(() => parsePylonWebhookEvents({})).not.toThrow()
  })
})

// ── transformTicket ───────────────────────────────────────────────────────────

describe('transformTicket', () => {
  it('maps open issue with all fields', () => {
    const out = transformTicket({
      id: 'iss-1',
      number: 42,
      title: 'Login broken',
      state: 'waiting_on_you',
      source: 'slack',
      requester: { id: 'req-1', email: 'user@example.com' },
      assignee: { id: 'agent-1', email: 'agent@example.com' },
      team: { id: 'team-1' },
      tags: ['bug', 'urgent'],
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-16T10:00:00Z',
    })
    expect(out.id).toBe('iss-1')
    expect(out.platform).toBe('gorgias-aircall')
    expect(out.status).toBe('open')
    expect(out.channel).toBe('chat')
    expect(out.number).toBe('42')
    expect(out.subject).toBe('Login broken')
    expect(out.requesterId).toBe('req-1')
    expect(out.assigneeId).toBe('agent-1')
    expect(out.teamId).toBe('team-1')
    expect(out.tagIds).toContain('bug')
    expect(out.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(out.raw).toBeDefined()
  })

  it('maps on_hold state', () => {
    const out = transformTicket({ id: 'iss-2', state: 'on_hold', created_at: '2024-01-01T00:00:00Z' })
    expect(out.status).toBe('on_hold')
  })

  it('maps closed state and sets resolvedAt', () => {
    const out = transformTicket({
      id: 'iss-3',
      state: 'closed',
      resolution_time: '2024-02-01T12:00:00Z',
      created_at: '2024-01-01T00:00:00Z',
    })
    expect(out.status).toBe('closed')
    expect(out.resolvedAt).toBeTruthy()
  })

  it('maps email channel', () => {
    const out = transformTicket({ id: 'iss-4', source: 'email', created_at: '2024-01-01T00:00:00Z' })
    expect(out.channel).toBe('email')
  })

  it('maps phone to voice channel', () => {
    const out = transformTicket({ id: 'iss-5', source: 'phone', created_at: '2024-01-01T00:00:00Z' })
    expect(out.channel).toBe('voice')
  })

  it('maps csat_responses score', () => {
    const out = transformTicket({
      id: 'iss-6',
      csat_responses: [{ score: 4, comment: 'Good' }],
      created_at: '2024-01-01T00:00:00Z',
    })
    expect(out.satisfactionRating).toBe(4)
  })

  it('does not throw on minimal input', () => {
    expect(() => transformTicket({ id: 'iss-min' })).not.toThrow()
  })

  it('sets metadata with state and source', () => {
    const out = transformTicket({ id: 'iss-7', state: 'new', source: 'form', created_at: '2024-01-01T00:00:00Z' })
    expect(out.metadata['state']).toBe('new')
    expect(out.metadata['source']).toBe('form')
  })
})

// ── transformMessage ──────────────────────────────────────────────────────────

describe('transformMessage', () => {
  it('maps public reply from agent', () => {
    const out = transformMessage(
      {
        id: 'msg-1',
        message_html: '<p>Hello there</p>',
        author: { id: 'user-1', email: 'agent@example.com', type: 'user' },
        timestamp: '2024-01-15T12:00:00Z',
        is_private: false,
        source: 'slack',
      },
      'iss-1',
    )
    expect(out.id).toBe('msg-1')
    expect(out.ticketId).toBe('iss-1')
    expect(out.body).toContain('Hello there')
    expect(out.type).toBe('public')
    expect(out.authorType).toBe('user')
    expect(out.authorId).toBe('user-1')
    expect(out.platform).toBe('gorgias-aircall')
    expect(out.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(out.raw).toBeDefined()
  })

  it('maps internal note', () => {
    const out = transformMessage(
      { id: 'msg-2', is_private: true, author: { id: 'u-2', type: 'user' }, timestamp: '2024-01-15T13:00:00Z' },
      'iss-1',
    )
    expect(out.type).toBe('internal')
  })

  it('maps contact author type', () => {
    const out = transformMessage(
      { id: 'msg-3', author: { id: 'c-1', type: 'contact' }, timestamp: '2024-01-15T14:00:00Z' },
      'iss-1',
    )
    expect(out.authorType).toBe('contact')
  })

  it('counts file_urls as attachmentCount', () => {
    const out = transformMessage(
      { id: 'msg-4', file_urls: ['url1', 'url2'], timestamp: '2024-01-15T15:00:00Z' },
      'iss-1',
    )
    expect(out.attachmentCount).toBe(2)
  })

  it('strips HTML from message body', () => {
    const out = transformMessage(
      { id: 'msg-5', message_html: '<b>Bold</b> text', timestamp: '2024-01-15T16:00:00Z' },
      'iss-1',
    )
    expect(out.body).not.toContain('<b>')
    expect(out.body).toContain('Bold')
  })

  it('does not throw on empty message', () => {
    expect(() => transformMessage({ id: 'msg-6' }, 'iss-1')).not.toThrow()
  })
})

// ── transformContact ──────────────────────────────────────────────────────────

describe('transformContact', () => {
  it('maps all contact fields', () => {
    const out = transformContact({
      id: 'c-1',
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone_numbers: ['+1234567890'],
      avatar_url: 'https://example.com/avatar.png',
      account: { id: 'acc-1' },
      portal_role: 'admin',
    })
    expect(out.id).toBe('c-1')
    expect(out.name).toBe('Jane Doe')
    expect(out.email).toBe('jane@example.com')
    expect(out.phone).toBe('+1234567890')
    expect(out.organizationId).toBe('acc-1')
    expect(out.platform).toBe('gorgias-aircall')
    expect(out.metadata['portalRole']).toBe('admin')
    expect(out.raw).toBeDefined()
  })

  it('falls back to emails array when email is absent', () => {
    const out = transformContact({ id: 'c-2', emails: ['fallback@example.com'] })
    expect(out.email).toBe('fallback@example.com')
  })

  it('does not throw on minimal contact', () => {
    expect(() => transformContact({ id: 'c-min' })).not.toThrow()
  })
})

// ── transformUser ─────────────────────────────────────────────────────────────

describe('transformUser', () => {
  it('maps all user fields', () => {
    const out = transformUser({
      id: 'u-1',
      name: 'Alice Agent',
      email: 'alice@example.com',
      role_id: 'admin',
      status: 'active',
      avatar_url: 'https://example.com/pic.png',
    })
    expect(out.id).toBe('u-1')
    expect(out.name).toBe('Alice Agent')
    expect(out.email).toBe('alice@example.com')
    expect(out.role).toBe('admin')
    expect(out.platform).toBe('gorgias-aircall')
    expect(out.metadata['status']).toBe('active')
    expect(out.teamIds).toEqual([])
    expect(out.raw).toBeDefined()
  })

  it('falls back to emails array', () => {
    const out = transformUser({ id: 'u-2', emails: ['other@example.com'] })
    expect(out.email).toBe('other@example.com')
  })

  it('does not throw on minimal user', () => {
    expect(() => transformUser({ id: 'u-min' })).not.toThrow()
  })
})

// ── transformTag ──────────────────────────────────────────────────────────────

describe('transformTag', () => {
  it('maps tag fields', () => {
    const out = transformTag({
      id: 'tag-1',
      value: 'billing',
      hex_color: '#ff0000',
      object_type: 'issue',
    })
    expect(out.id).toBe('tag-1')
    expect(out.name).toBe('billing')
    expect(out.platform).toBe('gorgias-aircall')
    expect(out.metadata['hexColor']).toBe('#ff0000')
    expect(out.metadata['objectType']).toBe('issue')
    expect(out.raw).toBeDefined()
  })

  it('falls back to id when value is absent', () => {
    const out = transformTag({ id: 'tag-fallback' })
    expect(out.name).toBe('tag-fallback')
  })

  it('does not throw on minimal tag', () => {
    expect(() => transformTag({ id: 'tag-min' })).not.toThrow()
  })
})

// ── transformTeam ─────────────────────────────────────────────────────────────

describe('transformTeam', () => {
  it('maps team fields', () => {
    const out = transformTeam({
      id: 'team-1',
      name: 'Support',
      users: [{ id: 'u-1', email: 'a@example.com' }, { id: 'u-2', email: 'b@example.com' }],
    })
    expect(out.id).toBe('team-1')
    expect(out.name).toBe('Support')
    expect(out.platform).toBe('gorgias-aircall')
    expect(out.metadata['memberCount']).toBe('2')
    expect(out.raw).toBeDefined()
  })

  it('does not throw on minimal team', () => {
    expect(() => transformTeam({ id: 'team-min' })).not.toThrow()
  })
})

// ── transformMacro ────────────────────────────────────────────────────────────

describe('transformMacro', () => {
  it('maps all macro fields', () => {
    const out = transformMacro({
      id: 'macro-1',
      name: 'Greet customer',
      text_html: '<p>Hello!</p>',
      text_type: 'reply',
      macro_group_id: 'grp-1',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
      visibility: { type: 'private', user_ids: ['u-1'] },
    })
    expect(out.id).toBe('macro-1')
    expect(out.title).toBe('Greet customer')
    expect(out.body).toContain('Hello!')
    expect(out.body).not.toContain('<p>')
    expect(out.category).toBe('grp-1')
    expect(out.platform).toBe('gorgias-aircall')
    expect(out.metadata['textType']).toBe('reply')
    expect(out.metadata['visibilityType']).toBe('private')
    expect(out.raw).toBeDefined()
  })

  it('does not throw on minimal macro', () => {
    expect(() => transformMacro({ id: 'macro-min' })).not.toThrow()
  })

  it('returns empty body when text_html is absent', () => {
    const out = transformMacro({ id: 'macro-2', name: 'No body' })
    expect(out.body).toBe('')
  })
})

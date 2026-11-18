import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyTawkToWebhook,
  parseTawkToWebhookEvents,
} from '../../../../../src/verticals/customer-support/adapters/tawk-to/webhook'
import { transformTicket } from '../../../../../src/verticals/customer-support/adapters/tawk-to/transform/ticket'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/tawk-to/transform/message'
import { transformUser } from '../../../../../src/verticals/customer-support/adapters/tawk-to/transform/user'

// ── transformTicket ──────────────────────────────────────────────────────────

describe('transformTicket', () => {
  it('maps a basic open ticket', () => {
    const out = transformTicket({
      _id: 'ticket-abc',
      humanId: '42',
      subject: 'Login broken',
      status: 'open',
      requester: { name: 'Alice', email: 'alice@example.com', type: 'visitor' },
      createdAt: '2024-01-15T09:30:00.000Z',
      updatedAt: '2024-01-15T10:00:00.000Z',
    })
    expect(out.id).toBe('ticket-abc')
    expect(out.externalId).toBe('ticket-abc')
    expect(out.number).toBe('42')
    expect(out.subject).toBe('Login broken')
    expect(out.status).toBe('open')
    expect(out.requesterId).toBe('alice@example.com')
    expect(out.platform).toBe('tawk-to')
    expect(out.createdAt).toBe('2024-01-15T09:30:00.000Z')
    expect(out.metadata['requesterEmail']).toBe('alice@example.com')
  })

  it('maps a resolved ticket with assignee', () => {
    const out = transformTicket({
      _id: 'ticket-xyz',
      subject: 'Resolved issue',
      status: 'resolved',
      assignedTo: { _id: 'agent-1' },
      createdAt: '2024-01-10T08:00:00.000Z',
      updatedAt: '2024-01-11T09:00:00.000Z',
    })
    expect(out.status).toBe('resolved')
    expect(out.assigneeId).toBe('agent-1')
    expect(typeof out.resolvedAt).toBe('string')
  })

  it('maps a closed ticket', () => {
    const out = transformTicket({ _id: 'c1', subject: 'Done', status: 'closed' })
    expect(out.status).toBe('closed')
    expect(typeof out.resolvedAt).toBe('string')
  })

  it('falls back to open for unknown status', () => {
    const out = transformTicket({ _id: 't1', subject: 'test', status: 'UNKNOWN' })
    expect(out.status).toBe('open')
  })

  it('falls back to epoch zero when createdAt is missing', () => {
    const out = transformTicket({ _id: 't2', subject: 'no date' })
    expect(out.createdAt).toBe(new Date(0).toISOString())
  })

  it('does not throw on completely empty input', () => {
    expect(() => transformTicket({})).not.toThrow()
  })

  it('uses id fallback when _id is absent', () => {
    const out = transformTicket({ id: 'fallback-id', subject: 'test' })
    expect(out.id).toBe('fallback-id')
  })
})

// ── transformMessage ─────────────────────────────────────────────────────────

describe('transformMessage', () => {
  it('derives a unique synthetic ID from ticketId + timestamp + index', () => {
    const msg = {
      n: 'agent-99',
      t: 'a',
      msg: 'Hello visitor',
      time: '2024-03-01T12:00:00.000Z',
    }
    const out = transformMessage(msg, 'chat-1', 0)
    // id must NOT be raw.n (the sender id)
    expect(out.id).not.toBe('agent-99')
    expect(out.id).toBe('chat-1:2024-03-01T12:00:00.000Z:0')
    expect(out.externalId).toBe(out.id)
  })

  it('two messages from the same agent get different IDs via index', () => {
    const msg = { n: 'agent-99', t: 'a', msg: 'Msg 1', time: '2024-03-01T12:00:00.000Z' }
    const out0 = transformMessage(msg, 'chat-1', 0)
    const out1 = transformMessage(msg, 'chat-1', 1)
    expect(out0.id).not.toBe(out1.id)
  })

  it('maps agent sender type', () => {
    const out = transformMessage({ n: 'a1', t: 'a', msg: 'Hi' }, 'chat-1', 0)
    expect(out.authorType).toBe('agent')
    expect(out.authorId).toBe('a1')
  })

  it('maps visitor sender type', () => {
    const out = transformMessage({ n: 'v1', t: 'v', msg: 'Help!' }, 'chat-1', 0)
    expect(out.authorType).toBe('user')
  })

  it('maps system sender type', () => {
    const out = transformMessage({ n: 'sys', t: 's', msg: 'Auto reply' }, 'chat-1', 0)
    expect(out.authorType).toBe('system')
  })

  it('handles file attachments', () => {
    const out = transformMessage(
      { n: 'v1', t: 'v', msg: '', files: [{ id: 'f1', name: 'doc.pdf' }] },
      'chat-1',
      0,
    )
    expect(out.attachmentCount).toBe(1)
  })

  it('defaults idx to 0 when not provided', () => {
    const out = transformMessage({ t: 'a', msg: 'test' }, 'chat-x')
    // falls back to epoch + idx 0
    expect(out.id).toBe(`chat-x:${new Date(0).toISOString()}:0`)
  })

  it('does not throw on completely empty input', () => {
    expect(() => transformMessage({}, 'chat-0', 0)).not.toThrow()
  })

  it('sets platform to tawk-to', () => {
    const out = transformMessage({ msg: 'hi' }, 'c1', 0)
    expect(out.platform).toBe('tawk-to')
  })
})

// ── transformUser ─────────────────────────────────────────────────────────────

describe('transformUser', () => {
  it('maps an agent record', () => {
    const out = transformUser({
      _id: 'agent-1',
      fullName: 'Bob Agent',
      email: 'bob@company.com',
      type: 'admin',
    })
    expect(out.id).toBe('agent-1')
    expect(out.name).toBe('Bob Agent')
    expect(out.email).toBe('bob@company.com')
    expect(out.role).toBe('admin')
    expect(out.platform).toBe('tawk-to')
  })

  it('falls back to name when fullName is absent', () => {
    const out = transformUser({ _id: 'a2', name: 'Agent Two', email: 'a2@example.com' })
    expect(out.name).toBe('Agent Two')
  })

  it('does not throw on empty input', () => {
    expect(() => transformUser({})).not.toThrow()
  })
})

// ── verifyTawkToWebhook ──────────────────────────────────────────────────────

describe('verifyTawkToWebhook', () => {
  const secret = 'webhook-secret-123'
  const body = Buffer.from(JSON.stringify({ event: 'chat:start', chatId: 'c1' }))

  it('verifies a valid HMAC-SHA1 signature in lowercase header', () => {
    const sig = createHmac('sha1', secret).update(body).digest('hex')
    expect(verifyTawkToWebhook(body, { 'x-tawk-signature': sig }, secret)).toBe(true)
  })

  it('verifies a valid signature in title-case header fallback', () => {
    const sig = createHmac('sha1', secret).update(body).digest('hex')
    expect(verifyTawkToWebhook(body, { 'X-Tawk-Signature': sig }, secret)).toBe(true)
  })

  it('rejects an incorrect signature', () => {
    expect(verifyTawkToWebhook(body, { 'x-tawk-signature': 'wrong' }, secret)).toBe(false)
  })

  it('rejects when signature header is missing', () => {
    expect(verifyTawkToWebhook(body, {}, secret)).toBe(false)
  })

  it('does not throw on empty payload', () => {
    expect(() => verifyTawkToWebhook(Buffer.from(''), {}, secret)).not.toThrow()
  })
})

// ── parseTawkToWebhookEvents ─────────────────────────────────────────────────

describe('parseTawkToWebhookEvents', () => {
  it('maps chat:start to tickets/created', () => {
    const events = parseTawkToWebhookEvents({ event: 'chat:start', chatId: 'chat-1' })
    expect(events).toHaveLength(1)
    const ev = events[0]!
    expect(ev.platform).toBe('tawk-to')
    expect(ev.resourceType).toBe('tickets')
    expect(ev.action).toBe('created')
    expect(ev.resourceId).toBe('chat-1')
  })

  it('maps chat:end to tickets/updated', () => {
    const events = parseTawkToWebhookEvents({ event: 'chat:end', chatId: 'chat-2' })
    expect(events[0]!.action).toBe('updated')
  })

  it('maps chat:transcript_created to messages/commented with ticketId', () => {
    const events = parseTawkToWebhookEvents({
      event: 'chat:transcript_created',
      chatId: 'chat-3',
    })
    expect(events[0]!.resourceType).toBe('messages')
    expect(events[0]!.action).toBe('commented')
    expect(events[0]!.ticketId).toBe('chat-3')
  })

  it('maps ticket:create to tickets/created using ticket.id', () => {
    const events = parseTawkToWebhookEvents({
      event: 'ticket:create',
      ticket: { id: 'ticket-99', humanId: 'T-5' },
    })
    expect(events[0]!.resourceType).toBe('tickets')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.resourceId).toBe('ticket-99')
  })

  it('handles unknown events gracefully', () => {
    const events = parseTawkToWebhookEvents({ event: 'some:unknown' })
    expect(events).toHaveLength(1)
    expect(events[0]!.resourceType).toBe('unknown')
  })

  it('uses hookEventId when present', () => {
    const events = parseTawkToWebhookEvents({
      event: 'chat:start',
      chatId: 'c1',
      hookEventId: 'hook-event-abc',
    })
    expect(events[0]!.id).toBe('hook-event-abc')
  })
})

import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyRespondIoWebhook,
  parseRespondIoWebhookEvents,
} from '../../../../../src/verticals/customer-support/adapters/respond-io/webhook'
import { transformMessage } from '../../../../../src/verticals/customer-support/adapters/respond-io/transform/message'

describe('respond-io transformMessage', () => {
  it('maps an incoming message', () => {
    const out = transformMessage(
      {
        messageId: 'msg-1',
        contactId: 42,
        traffic: 'incoming',
        message: 'Hello',
        createdAt: '2026-01-01T00:00:00Z',
      },
      'conv-10',
    )
    expect(out.id).toBe('msg-1')
    expect(out.platform).toBe('respond-io')
    expect(out.authorType).toBe('contact')
    expect(out.body).toBe('Hello')
    expect(out.ticketId).toBe('conv-10')
  })

  it('maps an outgoing message', () => {
    const out = transformMessage(
      { id: 'msg-2', traffic: 'outgoing', message: 'Hi back' },
      'conv-11',
    )
    expect(out.authorType).toBe('user')
  })

  it('falls back to messageDetail.text when message field is absent', () => {
    const out = transformMessage({ id: 'msg-3', messageDetail: { text: 'From detail' } }, 'conv-12')
    expect(out.body).toBe('From detail')
  })
})

describe('respond-io webhook', () => {
  it('verifies HMAC-SHA256 over raw body (hex digest)', () => {
    const secret = 'webhook-secret'
    const body = Buffer.from('{"event":"message.created"}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyRespondIoWebhook(body, { 'x-respond-signature': sig }, secret)).toBe(true)
  })

  it('rejects a wrong signature', () => {
    const body = Buffer.from('{"event":"message.created"}')
    expect(verifyRespondIoWebhook(body, { 'x-respond-signature': 'bad' }, 'secret')).toBe(false)
  })

  it('rejects missing signature header', () => {
    expect(verifyRespondIoWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=respond-io', () => {
    const out = parseRespondIoWebhookEvents({
      event: 'message.created',
      data: { id: '55', conversationId: '10' },
    })
    expect(Array.isArray(out)).toBe(true)
    expect(out[0]!.platform).toBe('respond-io')
    expect(out[0]!.resourceType).toBe('messages')
    expect(out[0]!.action).toBe('created')
  })

  it('maps conversation.opened to tickets/reopened', () => {
    const out = parseRespondIoWebhookEvents({ event: 'conversation.opened', data: { id: '10' } })
    expect(out[0]!.resourceType).toBe('tickets')
    expect(out[0]!.action).toBe('reopened')
  })

  it('maps contact.created to contacts/created', () => {
    const out = parseRespondIoWebhookEvents({ event: 'contact.created', data: { id: '20' } })
    expect(out[0]!.resourceType).toBe('contacts')
    expect(out[0]!.action).toBe('created')
  })
})

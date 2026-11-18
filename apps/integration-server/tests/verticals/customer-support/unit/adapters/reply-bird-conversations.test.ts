import { describe, it, expect } from 'vitest'
import { createHash, createHmac } from 'node:crypto'
import {
  verifyBirdWebhook,
  parseBirdWebhookEvents,
} from '../../../../../src/verticals/customer-support/adapters/reply-bird-conversations/webhook'
import { ReplyBirdConversationsAdapter } from '../../../../../src/verticals/customer-support/adapters/reply-bird-conversations/index'

// Helper: produce a valid Bird webhook signature using the correct scheme:
//   HMAC-SHA256( timestamp + "\n" + url + "\n" + sha256(body as raw bytes) )
function makeBirdSig(body: Buffer, timestamp: string, url: string, secret: string): string {
  const bodyHashBytes = createHash('sha256').update(body).digest()
  const prefix = Buffer.from(`${timestamp}\n${url}\n`, 'utf8')
  const signedBuf = Buffer.concat([prefix, bodyHashBytes])
  return createHmac('sha256', secret).update(signedBuf).digest('base64')
}

describe('Bird webhook verifyBirdWebhook', () => {
  it('accepts a correctly signed request (raw binary body hash, empty URL)', () => {
    const secret = 'test-signing-key'
    const body = Buffer.from('{"type":"conversation.created","data":{"id":"conv-1"}}')
    const timestamp = '1700000000'
    const sig = makeBirdSig(body, timestamp, '', secret)
    const headers = {
      'messagebird-signature': sig,
      'messagebird-request-timestamp': timestamp,
    }
    expect(verifyBirdWebhook(body, headers, secret)).toBe(true)
  })

  it('rejects a signature computed with hex-encoded body hash (old incorrect scheme)', () => {
    const secret = 'test-signing-key'
    const body = Buffer.from('{"type":"conversation.created","data":{"id":"conv-1"}}')
    const timestamp = '1700000000'
    // Intentionally wrong: hex digest, not raw bytes
    const bodyHashHex = createHash('sha256').update(body).digest('hex')
    const signedString = `${timestamp}\n\n${bodyHashHex}`
    const wrongSig = createHmac('sha256', secret).update(signedString).digest('base64')
    const headers = {
      'messagebird-signature': wrongSig,
      'messagebird-request-timestamp': timestamp,
    }
    expect(verifyBirdWebhook(body, headers, secret)).toBe(false)
  })

  it('rejects a request with wrong secret', () => {
    const body = Buffer.from('{"test":true}')
    const timestamp = '1700000001'
    const sig = makeBirdSig(body, timestamp, '', 'correct-secret')
    const headers = {
      'messagebird-signature': sig,
      'messagebird-request-timestamp': timestamp,
    }
    expect(verifyBirdWebhook(body, headers, 'wrong-secret')).toBe(false)
  })

  it('rejects when messagebird-signature header is missing', () => {
    const body = Buffer.from('{}')
    const headers = { 'messagebird-request-timestamp': '1700000002' }
    expect(verifyBirdWebhook(body, headers, 'secret')).toBe(false)
  })

  it('rejects when messagebird-request-timestamp header is missing', () => {
    const body = Buffer.from('{}')
    const headers = { 'messagebird-signature': 'dGVzdA==' }
    expect(verifyBirdWebhook(body, headers, 'secret')).toBe(false)
  })

  it('rejects when both headers are missing', () => {
    expect(verifyBirdWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('rejects a tampered body', () => {
    const secret = 'my-secret'
    const body = Buffer.from('{"type":"message.created"}')
    const timestamp = '1700000003'
    const sig = makeBirdSig(body, timestamp, '', secret)
    const tampered = Buffer.from('{"type":"message.deleted"}')
    const headers = {
      'messagebird-signature': sig,
      'messagebird-request-timestamp': timestamp,
    }
    expect(verifyBirdWebhook(tampered, headers, secret)).toBe(false)
  })

  it('header lookup is case-insensitive', () => {
    const secret = 'ci-test'
    const body = Buffer.from('{"type":"test"}')
    const timestamp = '1700000004'
    const sig = makeBirdSig(body, timestamp, '', secret)
    const headers = {
      'MessageBird-Signature': sig,
      'MessageBird-Request-Timestamp': timestamp,
    }
    expect(verifyBirdWebhook(body, headers, secret)).toBe(true)
  })
})

describe('Bird parseBirdWebhookEvents', () => {
  it('maps conversation.created to tickets/created', () => {
    const events = parseBirdWebhookEvents({ type: 'conversation.created', data: { id: 'conv-1' } })
    expect(Array.isArray(events)).toBe(true)
    expect(events[0]!.platform).toBe('reply-bird-conversations')
    expect(events[0]!.resourceType).toBe('tickets')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.resourceId).toBe('conv-1')
  })

  it('maps conversation.updated to tickets/updated', () => {
    const events = parseBirdWebhookEvents({ type: 'conversation.updated', data: { id: 'conv-2' } })
    expect(events[0]!.resourceType).toBe('tickets')
    expect(events[0]!.action).toBe('updated')
  })

  it('maps message.created to messages/created with ticketId', () => {
    const events = parseBirdWebhookEvents({
      type: 'message.created',
      data: { id: 'msg-1', conversationId: 'conv-3' },
    })
    expect(events[0]!.resourceType).toBe('messages')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.ticketId).toBe('conv-3')
  })

  it('maps message.delivered to messages/updated', () => {
    const events = parseBirdWebhookEvents({ type: 'message.delivered', data: { id: 'msg-2' } })
    expect(events[0]!.resourceType).toBe('messages')
    expect(events[0]!.action).toBe('updated')
  })

  it('handles unknown event type gracefully', () => {
    const events = parseBirdWebhookEvents({ type: 'unknown.event', data: { id: 'x' } })
    expect(Array.isArray(events)).toBe(true)
    expect(events[0]!.platform).toBe('reply-bird-conversations')
  })
})

describe('ReplyBirdConversationsAdapter identity', () => {
  it('has platform=reply-bird-conversations', () => {
    const adapter = new ReplyBirdConversationsAdapter()
    expect(adapter.platform).toBe('reply-bird-conversations')
  })

  it('does not expose a getMessage method', () => {
    const adapter = new ReplyBirdConversationsAdapter()
    expect('getMessage' in adapter).toBe(false)
  })

  it('parseWebhookEvents returns array with platform=reply-bird-conversations', () => {
    const adapter = new ReplyBirdConversationsAdapter()
    const events = adapter.parseWebhookEvents({ type: 'conversation.created', data: { id: 'c1' } })
    expect(Array.isArray(events)).toBe(true)
    expect(events[0]!.platform).toBe('reply-bird-conversations')
  })
})

describe('ReplyBirdConversationsAdapter credentials', () => {
  // https://bird.com/docs/guides/authentication: "Every programmatic request to the
  // Bird API authenticates with an API key passed as a bearer token. Keys belong to
  // a workspace". The `bk_{region}_` prefix "names the credential type and its region".
  it('asks for the API key only (the key is bound to its workspace)', () => {
    expect(new ReplyBirdConversationsAdapter().credentialFields().map((f) => f.name)).toEqual([
      'apiKey',
    ])
  })

  it('stores a bk_ key as the access token', async () => {
    const creds = await new ReplyBirdConversationsAdapter().exchangeCredentials({
      apiKey: 'bk_eu1_abc',
    })
    expect(creds).toEqual({ accessToken: 'bk_eu1_abc' })
  })

  it('rejects a key without a documented region prefix', async () => {
    await expect(
      new ReplyBirdConversationsAdapter().exchangeCredentials({ apiKey: 'legacy-access-key' }),
    ).rejects.toThrow(/bk_us1_ or bk_eu1_/)
  })
})

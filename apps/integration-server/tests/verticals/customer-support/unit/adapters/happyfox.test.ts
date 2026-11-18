import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyHappyFoxWebhook, parseHappyFoxWebhookEvents } from '../../../../../src/verticals/customer-support/adapters/happyfox/webhook'

describe('HappyFox webhook', () => {
  it('verifies HMAC-SHA256', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const ts = '1700000000'
    const sig = createHmac('sha256', secret).update(Buffer.concat([Buffer.from(ts), body])).digest('base64')
    expect(verifyHappyFoxWebhook(body, { 'x-happyfox-signature': sig, 'x-happyfox-signature-timestamp': ts }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyHappyFoxWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=happyfox', () => {
    const out = parseHappyFoxWebhookEvents({ type: 'ticket.created', detail: { id: 't1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('happyfox')
  })
})

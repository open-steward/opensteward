import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyGrooveWebhook, parseGrooveWebhookEvents } from '../../../../../src/verticals/customer-support/adapters/groove/webhook'

describe('Groove webhook', () => {
  it('verifies HMAC-SHA256', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const ts = '1700000000'
    const sig = createHmac('sha256', secret).update(Buffer.concat([Buffer.from(ts), body])).digest('base64')
    expect(verifyGrooveWebhook(body, { 'x-groove-signature': sig, 'x-groove-signature-timestamp': ts }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyGrooveWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=groove', () => {
    const out = parseGrooveWebhookEvents({ type: 'ticket.created', detail: { id: 't1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('groove')
  })
})

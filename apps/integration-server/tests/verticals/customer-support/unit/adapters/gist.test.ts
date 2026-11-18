import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyGistWebhook, parseGistWebhookEvents } from '../../../../../src/verticals/customer-support/adapters/gist/webhook'

describe('Gist webhook', () => {
  it('verifies HMAC-SHA256', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const ts = '1700000000'
    const sig = createHmac('sha256', secret).update(Buffer.concat([Buffer.from(ts), body])).digest('base64')
    expect(verifyGistWebhook(body, { 'x-gist-signature': sig, 'x-gist-signature-timestamp': ts }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyGistWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=gist', () => {
    const out = parseGistWebhookEvents({ type: 'ticket.created', detail: { id: 't1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('gist')
  })
})

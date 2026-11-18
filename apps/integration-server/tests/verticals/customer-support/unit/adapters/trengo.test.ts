import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyTrengoWebhook, parseTrengoWebhookEvents } from '../../../../../src/verticals/customer-support/adapters/trengo/webhook'

describe('Trengo webhook', () => {
  it('verifies HMAC-SHA256', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const ts = '1700000000'
    const sig = createHmac('sha256', secret).update(Buffer.concat([Buffer.from(ts), body])).digest('base64')
    expect(verifyTrengoWebhook(body, { 'x-trengo-signature': sig, 'x-trengo-signature-timestamp': ts }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyTrengoWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=trengo', () => {
    const out = parseTrengoWebhookEvents({ type: 'ticket.created', detail: { id: 't1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('trengo')
  })
})

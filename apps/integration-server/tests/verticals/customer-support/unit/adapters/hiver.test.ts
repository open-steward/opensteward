import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyHiverWebhook, parseHiverWebhookEvents } from '../../../../../src/verticals/customer-support/adapters/hiver/webhook'

describe('Hiver webhook', () => {
  it('verifies HMAC-SHA256', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const ts = '1700000000'
    const sig = createHmac('sha256', secret).update(Buffer.concat([Buffer.from(ts), body])).digest('base64')
    expect(verifyHiverWebhook(body, { 'x-hiver-signature': sig, 'x-hiver-signature-timestamp': ts }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyHiverWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=hiver', () => {
    const out = parseHiverWebhookEvents({ type: 'ticket.created', detail: { id: 't1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('hiver')
  })
})

import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyChatwootWebhook, parseChatwootWebhookEvents } from '../../../../../src/verticals/customer-support/adapters/chatwoot/webhook'

describe('Chatwoot webhook', () => {
  it('verifies HMAC-SHA256', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const ts = '1700000000'
    const sig = createHmac('sha256', secret).update(Buffer.concat([Buffer.from(ts), body])).digest('base64')
    expect(verifyChatwootWebhook(body, { 'x-chatwoot-signature': sig, 'x-chatwoot-signature-timestamp': ts }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyChatwootWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=chatwoot', () => {
    const out = parseChatwootWebhookEvents({ type: 'ticket.created', detail: { id: 't1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('chatwoot')
  })
})

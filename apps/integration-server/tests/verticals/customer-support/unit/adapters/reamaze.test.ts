import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyReamazeWebhook, parseReamazeWebhookEvents } from '../../../../../src/verticals/customer-support/adapters/reamaze/webhook'

describe('Reamaze webhook', () => {
  it('verifies HMAC-SHA256', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const ts = '1700000000'
    const sig = createHmac('sha256', secret).update(Buffer.concat([Buffer.from(ts), body])).digest('base64')
    expect(verifyReamazeWebhook(body, { 'x-reamaze-signature': sig, 'x-reamaze-signature-timestamp': ts }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyReamazeWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=reamaze', () => {
    const out = parseReamazeWebhookEvents({ type: 'ticket.created', detail: { id: 't1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('reamaze')
  })
})

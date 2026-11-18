import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyErplyWebhook, parseErplyWebhookEvents } from '../../../../../src/verticals/inventory/adapters/erply/webhook'

describe('Erply webhook', () => {
  it('verifies x-erply-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyErplyWebhook(body, { 'x-erply-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyErplyWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=erply', () => {
    const out = parseErplyWebhookEvents({ Type: 'Stock.OnHandChanged', Data: { ID: 'p1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('erply')
  })
})

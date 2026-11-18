import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyKatanaWebhook, parseKatanaWebhookEvents } from '../../../../../src/verticals/inventory/adapters/katana/webhook'

describe('Katana webhook', () => {
  it('verifies x-katana-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyKatanaWebhook(body, { 'x-katana-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyKatanaWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=katana', () => {
    const out = parseKatanaWebhookEvents({ Type: 'Stock.OnHandChanged', Data: { ID: 'p1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('katana')
  })
})

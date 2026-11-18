import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyUnleashedWebhook, parseUnleashedWebhookEvents } from '../../../../../src/verticals/inventory/adapters/unleashed/webhook'

describe('Unleashed webhook', () => {
  it('verifies x-unleashed-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyUnleashedWebhook(body, { 'x-unleashed-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyUnleashedWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=unleashed', () => {
    const out = parseUnleashedWebhookEvents({ Type: 'Stock.OnHandChanged', Data: { ID: 'p1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('unleashed')
  })
})

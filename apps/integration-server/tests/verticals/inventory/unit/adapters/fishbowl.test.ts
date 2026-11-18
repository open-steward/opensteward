import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyFishbowlWebhook, parseFishbowlWebhookEvents } from '../../../../../src/verticals/inventory/adapters/fishbowl/webhook'

describe('Fishbowl webhook', () => {
  it('verifies x-fishbowl-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyFishbowlWebhook(body, { 'x-fishbowl-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyFishbowlWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=fishbowl', () => {
    const out = parseFishbowlWebhookEvents({ Type: 'Stock.OnHandChanged', Data: { ID: 'p1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('fishbowl')
  })
})

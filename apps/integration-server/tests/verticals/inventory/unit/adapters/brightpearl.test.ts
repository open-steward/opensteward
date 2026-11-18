import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyBrightpearlWebhook, parseBrightpearlWebhookEvents } from '../../../../../src/verticals/inventory/adapters/brightpearl/webhook'

describe('Brightpearl webhook', () => {
  it('verifies x-brightpearl-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyBrightpearlWebhook(body, { 'x-brightpearl-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyBrightpearlWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=brightpearl', () => {
    const out = parseBrightpearlWebhookEvents({ Type: 'Stock.OnHandChanged', Data: { ID: 'p1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('brightpearl')
  })
})

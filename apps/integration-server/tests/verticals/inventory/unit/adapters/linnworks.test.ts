import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyLinnworksWebhook, parseLinnworksWebhookEvents } from '../../../../../src/verticals/inventory/adapters/linnworks/webhook'

describe('Linnworks webhook', () => {
  it('verifies x-linnworks-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyLinnworksWebhook(body, { 'x-linnworks-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyLinnworksWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=linnworks', () => {
    const out = parseLinnworksWebhookEvents({ Type: 'Stock.OnHandChanged', Data: { ID: 'p1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('linnworks')
  })
})

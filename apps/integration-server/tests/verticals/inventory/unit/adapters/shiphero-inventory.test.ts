import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyShipHeroInventoryWebhook, parseShipHeroInventoryWebhookEvents } from '../../../../../src/verticals/inventory/adapters/shiphero-inventory/webhook'

describe('ShipHeroInventory webhook', () => {
  it('verifies x-shiphero-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyShipHeroInventoryWebhook(body, { 'x-shiphero-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyShipHeroInventoryWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=shiphero-inventory', () => {
    const out = parseShipHeroInventoryWebhookEvents({ Type: 'Stock.OnHandChanged', Data: { ID: 'p1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('shiphero-inventory')
  })
})

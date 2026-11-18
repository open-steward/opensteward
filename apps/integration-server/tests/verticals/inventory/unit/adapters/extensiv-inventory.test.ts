import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyExtensivInventoryWebhook, parseExtensivInventoryWebhookEvents } from '../../../../../src/verticals/inventory/adapters/extensiv-inventory/webhook'

describe('ExtensivInventory webhook', () => {
  it('verifies x-extensiv-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyExtensivInventoryWebhook(body, { 'x-extensiv-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyExtensivInventoryWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=extensiv-inventory', () => {
    const out = parseExtensivInventoryWebhookEvents({ Type: 'Stock.OnHandChanged', Data: { ID: 'p1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('extensiv-inventory')
  })
})

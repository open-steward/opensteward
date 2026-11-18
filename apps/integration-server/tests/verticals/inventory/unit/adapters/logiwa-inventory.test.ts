import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyLogiwaInventoryWebhook, parseLogiwaInventoryWebhookEvents } from '../../../../../src/verticals/inventory/adapters/logiwa-inventory/webhook'

describe('LogiwaInventory webhook', () => {
  it('verifies x-logiwa-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyLogiwaInventoryWebhook(body, { 'x-logiwa-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyLogiwaInventoryWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=logiwa-inventory', () => {
    const out = parseLogiwaInventoryWebhookEvents({ Type: 'Stock.OnHandChanged', Data: { ID: 'p1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('logiwa-inventory')
  })
})

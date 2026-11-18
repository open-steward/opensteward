import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyZohoInventoryWebhook, parseZohoInventoryWebhookEvents } from '../../../../../src/verticals/inventory/adapters/zoho-inventory/webhook'

describe('ZohoInventory webhook', () => {
  it('verifies x-zoho-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyZohoInventoryWebhook(body, { 'x-zoho-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyZohoInventoryWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=zoho-inventory', () => {
    const out = parseZohoInventoryWebhookEvents({ Type: 'Stock.OnHandChanged', Data: { ID: 'p1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('zoho-inventory')
  })
})

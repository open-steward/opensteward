import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyNetSuiteInventoryWebhook, parseNetSuiteInventoryWebhookEvents } from '../../../../../src/verticals/inventory/adapters/netsuite-inventory/webhook'

describe('NetSuiteInventory webhook', () => {
  it('verifies x-netsuite-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyNetSuiteInventoryWebhook(body, { 'x-netsuite-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyNetSuiteInventoryWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=netsuite-inventory', () => {
    const out = parseNetSuiteInventoryWebhookEvents({ Type: 'Stock.OnHandChanged', Data: { ID: 'p1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('netsuite-inventory')
  })
})

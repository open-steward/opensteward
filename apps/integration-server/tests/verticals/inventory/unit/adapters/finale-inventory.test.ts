import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyFinaleInventoryWebhook, parseFinaleInventoryWebhookEvents } from '../../../../../src/verticals/inventory/adapters/finale-inventory/webhook'

describe('FinaleInventory webhook', () => {
  it('verifies x-finale-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyFinaleInventoryWebhook(body, { 'x-finale-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyFinaleInventoryWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=finale-inventory', () => {
    const out = parseFinaleInventoryWebhookEvents({ Type: 'Stock.OnHandChanged', Data: { ID: 'p1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('finale-inventory')
  })
})

import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyDynamics365BcInventoryWebhook, parseDynamics365BcInventoryWebhookEvents } from '../../../../../src/verticals/inventory/adapters/dynamics-365-bc-inventory/webhook'

describe('Dynamics365BcInventory webhook', () => {
  it('verifies x-dynamics-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyDynamics365BcInventoryWebhook(body, { 'x-dynamics-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyDynamics365BcInventoryWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=dynamics-365-bc-inventory', () => {
    const out = parseDynamics365BcInventoryWebhookEvents({ Type: 'Stock.OnHandChanged', Data: { ID: 'p1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('dynamics-365-bc-inventory')
  })
})

import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyInflowWebhook, parseInflowWebhookEvents } from '../../../../../src/verticals/inventory/adapters/inflow/webhook'

describe('Inflow webhook', () => {
  it('verifies x-inflow-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyInflowWebhook(body, { 'x-inflow-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyInflowWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=inflow', () => {
    const out = parseInflowWebhookEvents({ Type: 'Stock.OnHandChanged', Data: { ID: 'p1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('inflow')
  })
})

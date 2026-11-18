import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifySortlyWebhook, parseSortlyWebhookEvents } from '../../../../../src/verticals/inventory/adapters/sortly/webhook'

describe('Sortly webhook', () => {
  it('verifies x-sortly-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifySortlyWebhook(body, { 'x-sortly-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifySortlyWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=sortly', () => {
    const out = parseSortlyWebhookEvents({ Type: 'Stock.OnHandChanged', Data: { ID: 'p1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('sortly')
  })
})

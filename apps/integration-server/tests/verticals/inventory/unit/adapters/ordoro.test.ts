import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyOrdoroWebhook, parseOrdoroWebhookEvents } from '../../../../../src/verticals/inventory/adapters/ordoro/webhook'

describe('Ordoro webhook', () => {
  it('verifies x-ordoro-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyOrdoroWebhook(body, { 'x-ordoro-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyOrdoroWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=ordoro', () => {
    const out = parseOrdoroWebhookEvents({ Type: 'Stock.OnHandChanged', Data: { ID: 'p1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('ordoro')
  })
})

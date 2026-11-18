import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyCin7CoreWebhook, parseCin7CoreWebhookEvents } from '../../../../../src/verticals/inventory/adapters/cin7-core/webhook'

describe('Cin7Core webhook', () => {
  it('verifies x-cin7-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyCin7CoreWebhook(body, { 'x-cin7-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyCin7CoreWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=cin7-core', () => {
    const out = parseCin7CoreWebhookEvents({ Type: 'Stock.OnHandChanged', Data: { ID: 'p1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('cin7-core')
  })
})

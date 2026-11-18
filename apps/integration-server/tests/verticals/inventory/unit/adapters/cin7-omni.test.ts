import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyCin7OmniWebhook, parseCin7OmniWebhookEvents } from '../../../../../src/verticals/inventory/adapters/cin7-omni/webhook'

describe('Cin7Omni webhook', () => {
  it('verifies x-cin7-omni-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyCin7OmniWebhook(body, { 'x-cin7-omni-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyCin7OmniWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=cin7-omni', () => {
    const out = parseCin7OmniWebhookEvents({ Type: 'Stock.OnHandChanged', Data: { ID: 'p1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('cin7-omni')
  })
})

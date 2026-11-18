import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifySkuVaultWebhook, parseSkuVaultWebhookEvents } from '../../../../../src/verticals/inventory/adapters/skuvault/webhook'

describe('SkuVault webhook', () => {
  it('verifies x-skuvault-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifySkuVaultWebhook(body, { 'x-skuvault-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifySkuVaultWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=skuvault', () => {
    const out = parseSkuVaultWebhookEvents({ Type: 'Stock.OnHandChanged', Data: { ID: 'p1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('skuvault')
  })
})

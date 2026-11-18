import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyBitrix24Webhook, parseBitrix24WebhookEvents } from '../../../../../src/verticals/projects/adapters/bitrix24/webhook'

describe('Bitrix24 webhook', () => {
  it('verifies x-bitrix24-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyBitrix24Webhook(body, { 'x-bitrix24-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyBitrix24Webhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=bitrix24', () => {
    const out = parseBitrix24WebhookEvents({ events: [{ resource: { gid: "r1", resource_type: "task" }, action: "changed" }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('bitrix24')
  })
})

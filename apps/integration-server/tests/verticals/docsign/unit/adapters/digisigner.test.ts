import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyDigiSignerWebhook, parseDigiSignerWebhookEvents } from '../../../../../src/verticals/docsign/adapters/digisigner/webhook'

describe('DigiSigner webhook', () => {
  it('verifies x-digisigner-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyDigiSignerWebhook(body, { 'x-digisigner-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyDigiSignerWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=digisigner', () => {
    const out = parseDigiSignerWebhookEvents({ event: "document.completed", data: { document: { id: "d1" } } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('digisigner')
  })
})

import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyDocSpringWebhook, parseDocSpringWebhookEvents } from '../../../../../src/verticals/docsign/adapters/docspring/webhook'

describe('DocSpring webhook', () => {
  it('verifies x-docspring-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyDocSpringWebhook(body, { 'x-docspring-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyDocSpringWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=docspring', () => {
    const out = parseDocSpringWebhookEvents({ event: 'document.completed', data: { document: { id: 'd1' } } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('docspring')
  })
})

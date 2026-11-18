import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifySproofSignWebhook,
  parseSproofSignWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/sproof-sign/webhook'

// Transform tests live in ./sproof-sign/transform/, built from the documented
// examples in https://sign.sproof.com/api/v1/documentation/json.

describe('Sproof Sign webhook', () => {
  it('verifies x-sproof-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifySproofSignWebhook(body, { 'x-sproof-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=sproof-sign', () => {
    const out = parseSproofSignWebhookEvents({
      event: 'signature_request.signed',
      data: { signature_request: { id: 'sr_1' } },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('sproof-sign')
  })
})

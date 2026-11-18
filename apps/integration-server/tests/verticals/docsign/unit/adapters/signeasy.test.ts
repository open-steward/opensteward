import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifySignEasyWebhook,
  parseSignEasyWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/signeasy/webhook'

// Transform tests over the documented examples live in ./signeasy/transform/.

describe('SignEasy webhook', () => {
  it('verifies x-signeasy-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifySignEasyWebhook(body, { 'x-signeasy-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=signeasy', () => {
    const out = parseSignEasyWebhookEvents({
      event: 'request.completed',
      data: { request: { id: 'req_1' } },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('signeasy')
  })
})

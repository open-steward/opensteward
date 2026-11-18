import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyNamirialWebhook,
  parseNamirialWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/namirial/webhook'

describe('Namirial webhook', () => {
  it('verifies x-namirial-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyNamirialWebhook(body, { 'x-namirial-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=namirial', () => {
    const out = parseNamirialWebhookEvents({
      event: 'envelope.completed',
      data: { envelope: { Id: 'env_1' } },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('namirial')
  })
})

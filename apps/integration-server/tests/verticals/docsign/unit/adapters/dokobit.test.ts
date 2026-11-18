import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyDokobitWebhook,
  parseDokobitWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/dokobit/webhook'

describe('Dokobit webhook', () => {
  it('verifies x-dokobit-signature HMAC', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyDokobitWebhook(body, { 'x-dokobit-signature': sig }, secret)).toBe(true)
  })

  it('parses with platform=dokobit', () => {
    const out = parseDokobitWebhookEvents({
      event: 'signing.completed',
      data: { signing: { id: 'doc_1' } },
    })
    expect(out[0]!.platform).toBe('dokobit')
  })
})

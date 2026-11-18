import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyDTrustSignMeWebhook,
  parseDTrustSignMeWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/d-trust-sign-me/webhook'

describe('D-Trust sign-me webhook', () => {
  it('verifies x-sign-me-signature HMAC', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyDTrustSignMeWebhook(body, { 'x-sign-me-signature': sig }, secret)).toBe(true)
  })

  it('parses with platform=d-trust-sign-me', () => {
    const out = parseDTrustSignMeWebhookEvents({
      event: 'document.completed',
      data: { document: { id: 'doc_1' } },
    })
    expect(out[0]!.platform).toBe('d-trust-sign-me')
  })
})

import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyAutentiWebhook,
  parseAutentiWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/autenti/webhook'

// Transform tests live under ./autenti/transform/, built from Autenti's
// documented examples. These webhook tests pin the adapter's existing
// verifier, which the list rebuild did not touch.

describe('Autenti webhook', () => {
  it('verifies x-autenti-signature HMAC', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyAutentiWebhook(body, { 'x-autenti-signature': sig }, secret)).toBe(true)
  })

  it('parses with platform=autenti', () => {
    const out = parseAutentiWebhookEvents({
      event: 'document.completed',
      data: { document: { id: 'doc_1' } },
    })
    expect(out[0]!.platform).toBe('autenti')
  })
})

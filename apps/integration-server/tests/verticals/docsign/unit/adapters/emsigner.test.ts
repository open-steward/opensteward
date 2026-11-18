import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyEmSignerWebhook,
  parseEmSignerWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/emsigner/webhook'

// The transforms are pinned against the documented replies in ./emsigner/transform/.

describe('emSigner webhook', () => {
  it('verifies x-emsigner-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyEmSignerWebhook(body, { 'x-emsigner-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=emsigner', () => {
    const out = parseEmSignerWebhookEvents({
      event: 'envelope.completed',
      data: { envelope: { envelopeId: 'env_1' } },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('emsigner')
  })
})

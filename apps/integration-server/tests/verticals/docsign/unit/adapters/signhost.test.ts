import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifySignhostWebhook,
  parseSignhostWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/signhost/webhook'

// Transform, paging and request-shape tests: ./signhost/.

describe('Signhost webhook', () => {
  it('verifies x-signhost-signature HMAC', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifySignhostWebhook(body, { 'x-signhost-signature': sig }, secret)).toBe(true)
  })

  it('parses with platform=signhost', () => {
    const out = parseSignhostWebhookEvents({
      event: 'transaction.completed',
      data: { transaction: { id: 'tx_1' } },
    })
    expect(out[0]!.platform).toBe('signhost')
  })
})

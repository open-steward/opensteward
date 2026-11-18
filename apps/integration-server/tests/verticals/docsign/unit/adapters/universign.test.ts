import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyUniversignWebhook,
  parseUniversignWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/universign/webhook'

describe('Universign webhook', () => {
  it('verifies x-universign-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyUniversignWebhook(body, { 'x-universign-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=universign', () => {
    const out = parseUniversignWebhookEvents({
      event: 'transaction.completed',
      data: { transaction: { id: 'tx_1' } },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('universign')
  })
})

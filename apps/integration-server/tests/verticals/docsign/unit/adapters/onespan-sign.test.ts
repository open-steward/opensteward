import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/onespan-sign/transform/envelope'
import {
  verifyOneSpanSignWebhook,
  parseOneSpanSignWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/onespan-sign/webhook'

describe('OneSpan Sign transform', () => {
  it('maps a package to canonical Envelope', () => {
    const out = transformEnvelope({
      id: 'pkg_1',
      status: 'COMPLETED',
      name: 'NDA',
      sender: { id: 'u1', email: 'sender@example.com', firstName: 'Sue', lastName: 'Sender' },
      documents: [{ id: 'd1' }],
      created: '2025-01-01T00:00:00Z',
    })
    expect(out.id).toBe('pkg_1')
    expect(out.platform).toBe('onespan-sign')
    expect(out.status).toBe('completed')
  })
})

describe('OneSpan Sign webhook', () => {
  it('verifies x-esl-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyOneSpanSignWebhook(body, { 'x-esl-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=onespan-sign', () => {
    const out = parseOneSpanSignWebhookEvents({
      name: 'PACKAGE_COMPLETE',
      packageId: 'pkg_1',
      sessionUser: 'u1',
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('onespan-sign')
  })
})

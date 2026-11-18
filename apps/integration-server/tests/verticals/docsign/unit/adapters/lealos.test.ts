import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/lealos/transform/envelope'
import {
  verifyLealosWebhook,
  parseLealosWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/lealos/webhook'

describe('Lealos transform', () => {
  it('maps a document to canonical Envelope', () => {
    const out = transformEnvelope({
      id: 'doc_1',
      title: 'NDA',
      status: 'completed',
      signers: [{ id: 's1', email: 'a@example.com' }],
      created_at: '2025-01-01T00:00:00Z',
    })
    expect(out.platform).toBe('lealos')
  })
})

describe('Lealos webhook', () => {
  it('verifies x-lealos-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyLealosWebhook(body, { 'x-lealos-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=lealos', () => {
    const out = parseLealosWebhookEvents({
      event: 'document.completed',
      data: { document: { id: 'doc_1' } },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('lealos')
  })
})

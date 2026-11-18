import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/signaturit/transform/envelope'
import {
  verifySignaturitWebhook,
  parseSignaturitWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/signaturit/webhook'

describe('Signaturit transform', () => {
  it('maps a documented signature to canonical Envelope', () => {
    const out = transformEnvelope({
      id: 'sig_1',
      created_at: '2025-01-01T00:00:00+0000',
      data: [],
      documents: [
        {
          id: 'd1',
          email: 'a@example.com',
          name: 'A',
          status: 'completed',
          file: { name: 'nda.pdf' },
        },
      ],
    })
    expect(out.id).toBe('sig_1')
    expect(out.platform).toBe('signaturit')
    expect(out.status).toBe('completed')
  })
})

describe('Signaturit webhook', () => {
  it('verifies x-signaturit-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifySignaturitWebhook(body, { 'x-signaturit-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=signaturit', () => {
    const out = parseSignaturitWebhookEvents({
      event: 'signature.completed',
      data: { signature: { id: 'sig_1' } },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('signaturit')
  })
})

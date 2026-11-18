import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/digio/transform/envelope'
import {
  verifyDigioWebhook,
  parseDigioWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/digio/webhook'

describe('Digio transform', () => {
  it('maps a signed document to canonical Envelope', () => {
    const out = transformEnvelope({
      id: 'doc_1',
      file_name: 'NDA',
      agreement_status: 'signed',
      signing_parties: [{ id: 's1', identifier: 'a@example.com' }],
      created_at: '2025-01-01T00:00:00Z',
    })
    expect(out.platform).toBe('digio')
  })
})

describe('Digio webhook', () => {
  it('verifies x-digio-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyDigioWebhook(body, { 'x-digio-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=digio', () => {
    const out = parseDigioWebhookEvents({
      event: 'document.completed',
      payload: { id: 'doc_1' },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('digio')
  })
})

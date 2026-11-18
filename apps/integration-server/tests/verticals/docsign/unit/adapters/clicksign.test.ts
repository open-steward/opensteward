import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/clicksign/transform/envelope'
import {
  verifyClicksignWebhook,
  parseClicksignWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/clicksign/webhook'

describe('Clicksign transform', () => {
  it('maps a closed document to canonical Envelope', () => {
    const out = transformEnvelope({
      key: 'doc_1',
      filename: 'NDA',
      status: 'closed',
      signers: [{ key: 's1', email: 'a@example.com' }],
      uploaded_at: '2025-01-01T00:00:00Z',
    })
    expect(out.platform).toBe('clicksign')
    expect(out.status).toBe('completed')
  })
})

describe('Clicksign webhook', () => {
  it('verifies content-hmac HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyClicksignWebhook(body, { 'content-hmac': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=clicksign', () => {
    const out = parseClicksignWebhookEvents({
      event: { name: 'auto_close', data: { document: { key: 'doc_1' } } },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('clicksign')
  })
})

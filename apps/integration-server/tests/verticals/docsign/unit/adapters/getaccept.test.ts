import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/getaccept/transform/envelope'
import {
  verifyGetAcceptWebhook,
  parseGetAcceptWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/getaccept/webhook'

describe('GetAccept transform', () => {
  it('maps a document to canonical Envelope', () => {
    const out = transformEnvelope({
      id: 'doc_1',
      status: 'signed',
      name: 'NDA',
      sender: { id: 'u1', email: 'sender@example.com', first_name: 'Sue', last_name: 'Sender' },
      recipients: [{ id: 'r1', email: 'a@example.com', signing_order: 1 }],
      created_at: '2025-01-01T00:00:00Z',
    })
    expect(out.id).toBe('doc_1')
    expect(out.platform).toBe('getaccept')
    expect(out.status).toBe('completed')
  })
})

describe('GetAccept webhook', () => {
  it('verifies x-getaccept-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyGetAcceptWebhook(body, { 'x-getaccept-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=getaccept', () => {
    const out = parseGetAcceptWebhookEvents({
      event: 'document.completed',
      document: { id: 'doc_1' },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('getaccept')
  })
})

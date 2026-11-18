import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/foxit-esign/transform/envelope'
import {
  verifyFoxitESignWebhook,
  parseFoxitESignWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/foxit-esign/webhook'

describe('Foxit eSign transform', () => {
  it('maps an envelope to canonical Envelope', () => {
    const out = transformEnvelope({
      envelopeId: 'env_1',
      status: 'Completed',
      emailSubject: 'NDA',
      sender: { id: 'u1', email: 'sender@example.com', name: 'Sue Sender' },
      recipients: [{ id: 'r1', email: 'a@example.com' }],
      documents: [{ id: 'd1' }],
      createdAt: '2025-01-01T00:00:00Z',
    })
    expect(out.id).toBe('env_1')
    expect(out.platform).toBe('foxit-esign')
    expect(out.status).toBe('completed')
  })
})

describe('Foxit eSign webhook', () => {
  it('verifies x-esign-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyFoxitESignWebhook(body, { 'x-esign-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=foxit-esign', () => {
    const out = parseFoxitESignWebhookEvents({
      event: 'envelope_completed',
      envelope: { envelopeId: 'env_1' },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('foxit-esign')
  })
})

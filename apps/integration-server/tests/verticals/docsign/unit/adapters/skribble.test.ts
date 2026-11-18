import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/skribble/transform/envelope'
import {
  verifySkribbleWebhook,
  parseSkribbleWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/skribble/webhook'

describe('Skribble transform', () => {
  it('maps a signature_request to canonical Envelope', () => {
    const out = transformEnvelope({
      id: 'sr_1',
      title: 'NDA',
      status: 'SIGNED',
      owner: 'sender@example.com',
      signatures: [{ sid: 'sig_1', account_email: 'a@example.com' }],
      documents: [{ document_id: 'd1' }],
      created_at: '2025-01-01T00:00:00Z',
    })
    expect(out.id).toBe('sr_1')
    expect(out.platform).toBe('skribble')
    expect(out.status).toBe('completed')
  })
})

describe('Skribble webhook', () => {
  it('verifies x-skribble-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifySkribbleWebhook(body, { 'x-skribble-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=skribble', () => {
    const out = parseSkribbleWebhookEvents({
      event: 'signature_request.signed',
      data: { signature_request: { id: 'sr_1' } },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('skribble')
  })
})

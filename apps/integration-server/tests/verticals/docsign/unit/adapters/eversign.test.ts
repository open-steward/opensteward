import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/eversign/transform/envelope'
import {
  verifyEversignWebhook,
  parseEversignWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/eversign/webhook'

describe('eversign transform', () => {
  it('maps a completed document to canonical Envelope', () => {
    const out = transformEnvelope({
      document_hash: 'h1',
      title: 'NDA',
      is_completed: 1,
      signers: [{ id: 's1', email: 'a@example.com', routing_order: 1 }],
      files: [{ file_id: 'f1' }],
      created_at: 1735689600,
    })
    expect(out.id).toBe('h1')
    expect(out.platform).toBe('eversign')
    expect(out.status).toBe('completed')
  })
})

describe('eversign webhook', () => {
  it('verifies x-eversign-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyEversignWebhook(body, { 'x-eversign-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=eversign', () => {
    const out = parseEversignWebhookEvents({
      event_type: 'document_completed',
      meta: { related_document_hash: 'h1' },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('eversign')
  })
})

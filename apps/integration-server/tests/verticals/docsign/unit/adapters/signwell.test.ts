import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/signwell/transform/envelope'
import {
  verifySignWellWebhook,
  parseSignWellWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/signwell/webhook'

describe('SignWell transform', () => {
  it('maps a document to canonical Envelope', () => {
    const out = transformEnvelope({
      id: 'doc_1',
      status: 'Completed',
      name: 'NDA',
      user_email: 'sender@example.com',
      recipients: [{ id: 'r1', email: 'a@example.com', signing_order: 1 }],
      created_at: '2025-01-01T00:00:00Z',
    })
    expect(out.id).toBe('doc_1')
    expect(out.platform).toBe('signwell')
    expect(out.status).toBe('completed')
    expect(out.signerIds).toEqual(['r1'])
  })
})

describe('SignWell webhook', () => {
  it('verifies x-signwell-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifySignWellWebhook(body, { 'x-signwell-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=signwell', () => {
    const out = parseSignWellWebhookEvents({
      event: 'document_completed',
      data: { document: { id: 'doc_1' } },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('signwell')
  })
})

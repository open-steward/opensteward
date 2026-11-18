import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/modusign/transform/envelope'
import {
  verifyModusignWebhook,
  parseModusignWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/modusign/webhook'

describe('Modusign transform', () => {
  it('maps a completed document to canonical Envelope', () => {
    const out = transformEnvelope({
      id: 'doc_1',
      title: 'NDA',
      status: 'COMPLETED',
      participants: [{ id: 'p1', email: 'a@example.com' }],
      createdAt: '2025-01-01T00:00:00Z',
    })
    expect(out.platform).toBe('modusign')
    expect(out.status).toBe('completed')
  })
})

describe('Modusign webhook', () => {
  it('verifies x-modusign-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyModusignWebhook(body, { 'x-modusign-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=modusign', () => {
    const out = parseModusignWebhookEvents({
      event: 'DOCUMENT_SIGNED',
      data: { document: { id: 'doc_1' }, participant: { id: 'p1' } },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('modusign')
  })
})

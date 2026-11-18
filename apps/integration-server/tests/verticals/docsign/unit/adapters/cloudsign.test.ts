import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/cloudsign/transform/envelope'
import {
  verifyCloudSignWebhook,
  parseCloudSignWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/cloudsign/webhook'

describe('CloudSign transform', () => {
  it('maps a document to canonical Envelope', () => {
    const out = transformEnvelope({
      id: 'doc_1',
      title: 'NDA',
      status: 'signed',
      participants: [{ id: 'p1', email: 'a@example.com', order: 1 }],
      created_at: '2025-01-01T00:00:00Z',
    })
    expect(out.id).toBe('doc_1')
    expect(out.platform).toBe('cloudsign')
    expect(out.status).toBe('completed')
  })
})

describe('CloudSign webhook', () => {
  it('verifies x-cloudsign-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyCloudSignWebhook(body, { 'x-cloudsign-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=cloudsign', () => {
    const out = parseCloudSignWebhookEvents({
      event: 'document.completed',
      data: { document: { id: 'doc_1' } },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('cloudsign')
  })
})

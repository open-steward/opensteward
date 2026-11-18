import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/zoho-sign/transform/envelope'
import {
  verifyZohoSignWebhook,
  parseZohoSignWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/zoho-sign/webhook'

describe('Zoho Sign transform', () => {
  it('maps a request to a canonical Envelope', () => {
    const out = transformEnvelope({
      request_id: 'req_1',
      request_status: 'completed',
      request_subject: 'NDA',
      owner_email: 'sender@example.com',
      created_time: '2025-01-01T00:00:00Z',
      document_ids: [{ document_id: 'd1' }],
    })
    expect(out.id).toBe('req_1')
    expect(out.platform).toBe('zoho-sign')
    expect(out.status).toBe('completed')
    expect(out.documentIds).toEqual(['d1'])
  })
})

describe('Zoho Sign webhook', () => {
  it('verifies x-zohosign-webhook-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyZohoSignWebhook(body, { 'x-zohosign-webhook-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=zoho-sign', () => {
    const out = parseZohoSignWebhookEvents({
      notifications: { performed_at: 1735689600 },
      requests: { request_id: 'req_1', request_status: 'completed', action_type: 'RequestCompleted' },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('zoho-sign')
  })
})

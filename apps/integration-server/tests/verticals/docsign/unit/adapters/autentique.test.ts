import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/autentique/transform/envelope'
import {
  verifyAutentiqueWebhook,
  parseAutentiqueWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/autentique/webhook'

describe('Autentique transform', () => {
  it('maps a completed document to canonical Envelope', () => {
    const out = transformEnvelope({
      id: 'doc_1',
      name: 'NDA',
      status: 'Concluído',
      sortable: false,
      signatures: [
        { public_id: 's1', email: 'a@example.com', signed: { created_at: '2025-01-02T00:00:00Z', ip: '1.2.3.4' } },
      ],
      created_at: '2025-01-01T00:00:00Z',
    })
    expect(out.id).toBe('doc_1')
    expect(out.platform).toBe('autentique')
    expect(out.status).toBe('completed')
  })
})

describe('Autentique webhook', () => {
  it('verifies x-autentique-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyAutentiqueWebhook(body, { 'x-autentique-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=autentique', () => {
    const out = parseAutentiqueWebhookEvents({
      event: 'document.completed',
      data: { document: { id: 'doc_1' } },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('autentique')
  })
})

import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/a-trust/transform/envelope'
import {
  verifyATrustWebhook,
  parseATrustWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/a-trust/webhook'

describe('A-Trust transform', () => {
  it('maps a completed dossier', () => {
    const out = transformEnvelope({
      id: 'doc_1',
      name: 'NDA',
      status: 'COMPLETED',
      signers: [{ id: 's1', email: 'a@example.com', order: 1, status: 'SIGNED' }],
      documents: [{ id: 'd1' }],
      created_at: '2025-01-01T00:00:00Z',
    })
    expect(out.platform).toBe('a-trust')
    expect(out.status).toBe('completed')
  })
})

describe('A-Trust webhook', () => {
  it('verifies x-a-trust-signature HMAC', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyATrustWebhook(body, { 'x-a-trust-signature': sig }, secret)).toBe(true)
  })

  it('parses with platform=a-trust', () => {
    const out = parseATrustWebhookEvents({
      event: 'dossier.completed',
      data: { dossier: { id: 'doc_1' } },
    })
    expect(out[0]!.platform).toBe('a-trust')
  })
})

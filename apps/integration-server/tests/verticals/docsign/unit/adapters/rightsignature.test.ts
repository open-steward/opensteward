import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/rightsignature/transform/envelope'
import {
  verifyRightSignatureWebhook,
  parseRightSignatureWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/rightsignature/webhook'

describe('RightSignature transform', () => {
  it('maps an executed document to canonical Envelope', () => {
    const out = transformEnvelope({
      id: 'doc_1',
      status: 'executed',
      subject: 'NDA',
      sender: { id: 'u1', email: 'sender@example.com', name: 'Sue Sender' },
      signers: [{ id: 's1', signing_order: 1 }],
      created_at: '2025-01-01T00:00:00Z',
    })
    expect(out.id).toBe('doc_1')
    expect(out.platform).toBe('rightsignature')
    expect(out.status).toBe('completed')
  })
})

describe('RightSignature webhook', () => {
  it('verifies x-rightsignature-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyRightSignatureWebhook(body, { 'x-rightsignature-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=rightsignature', () => {
    const out = parseRightSignatureWebhookEvents({
      event: 'document.signed',
      data: { document: { id: 'doc_1' }, signer: { id: 's1' } },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('rightsignature')
  })
})

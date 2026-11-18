import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/d4sign/transform/envelope'
import {
  verifyD4SignWebhook,
  parseD4SignWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/d4sign/webhook'

describe('D4Sign transform', () => {
  it('maps a finished document to canonical Envelope', () => {
    const out = transformEnvelope({
      uuid: 'doc_1',
      nameDoc: 'NDA',
      statusId: '4',
      signers: [{ email: 'a@example.com' }],
      uploadDate: '2025-01-01T00:00:00Z',
    })
    expect(out.platform).toBe('d4sign')
  })
})

describe('D4Sign webhook', () => {
  it('verifies x-d4sign-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyD4SignWebhook(body, { 'x-d4sign-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=d4sign', () => {
    const out = parseD4SignWebhookEvents({
      type_post: 'document.finished',
      uuid: 'doc_1',
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('d4sign')
  })
})

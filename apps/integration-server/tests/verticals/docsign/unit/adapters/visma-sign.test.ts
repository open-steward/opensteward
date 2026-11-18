import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/visma-sign/transform/envelope'
import {
  verifyVismaSignWebhook,
  parseVismaSignWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/visma-sign/webhook'

describe('Visma Sign transform', () => {
  it('maps a signed document', () => {
    const out = transformEnvelope({
      uuid: 'e59c8dc8-8848-4936-ac7c-50d9ed72085a',
      name: 'Test document',
      status: 'signed',
      invitations: [{ uuid: '2076243e-351d-4b29-86ad-c2b02d7f867d', status: 'signed' }],
    })
    expect(out.id).toBe('e59c8dc8-8848-4936-ac7c-50d9ed72085a')
    expect(out.platform).toBe('visma-sign')
    expect(out.status).toBe('completed')
  })
})

describe('Visma Sign webhook', () => {
  it('verifies x-visma-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyVismaSignWebhook(body, { 'x-visma-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=visma-sign', () => {
    const out = parseVismaSignWebhookEvents({
      event: 'document.completed',
      data: { document: { uuid: 'doc_1' } },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('visma-sign')
  })
})

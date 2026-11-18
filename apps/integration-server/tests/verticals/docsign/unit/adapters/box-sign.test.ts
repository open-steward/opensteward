import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/box-sign/transform/envelope'
import {
  verifyBoxSignWebhook,
  parseBoxSignWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/box-sign/webhook'

describe('Box Sign transform', () => {
  it('maps a sign_request to canonical Envelope', () => {
    const out = transformEnvelope({
      id: 'sr_1',
      status: 'signed',
      email_subject: 'Sign please',
      sender_email: 'sender@example.com',
      signers: [{ id: 's1', order: 1 }],
      source_files: [{ id: 'f1' }],
      created_at: '2025-01-01T00:00:00Z',
    })
    expect(out.id).toBe('sr_1')
    expect(out.platform).toBe('box-sign')
    expect(out.status).toBe('completed')
    expect(out.documentIds).toEqual(['f1'])
  })
})

describe('Box Sign webhook', () => {
  it('verifies x-box-signature-primary HMAC-SHA1 base64 of <timestamp><body>', () => {
    const secret = 'shh'
    const timestamp = '2025-01-01T00:00:00Z'
    const body = Buffer.from('{}')
    const message = Buffer.concat([Buffer.from(timestamp, 'utf8'), body])
    const sig = createHmac('sha1', secret).update(message).digest('base64')
    expect(
      verifyBoxSignWebhook(
        body,
        { 'x-box-delivery-timestamp': timestamp, 'x-box-signature-primary': sig },
        secret,
      ),
    ).toBe(true)
  })

  it('parses a webhook event with platform=box-sign', () => {
    const out = parseBoxSignWebhookEvents({
      trigger: 'SIGN_REQUEST.SIGNED',
      source: { id: 'sr_1' },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('box-sign')
  })
})

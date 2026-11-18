import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/penneo/transform/envelope'
import {
  verifyPenneoWebhook,
  parsePenneoWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/penneo/webhook'

describe('Penneo transform', () => {
  it('maps a completed casefile (status code 3)', () => {
    const out = transformEnvelope({
      id: 42,
      title: 'NDA',
      status: 3,
      sender: { id: 1, email: 'sender@example.com', name: 'Sue' },
      signers: [101, 102],
      documents: [201, 202],
      created: '2025-01-01T00:00:00Z',
    })
    expect(out.id).toBe('42')
    expect(out.platform).toBe('penneo')
    expect(out.status).toBe('completed')
    expect(out.signerIds).toEqual(['101', '102'])
  })
})

describe('Penneo webhook', () => {
  it('verifies x-penneo-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyPenneoWebhook(body, { 'x-penneo-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=penneo', () => {
    const out = parsePenneoWebhookEvents({
      event: 'casefile.completed',
      data: { casefile: { id: 42 } },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('penneo')
  })
})

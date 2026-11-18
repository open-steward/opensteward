import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/nitro-sign/transform/envelope'
import {
  verifyNitroSignWebhook,
  parseNitroSignWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/nitro-sign/webhook'

describe('Nitro Sign transform', () => {
  it('maps a transaction to canonical Envelope', () => {
    const out = transformEnvelope({
      id: 'tx_1',
      status: 'COMPLETED',
      subject: 'NDA',
      sender: { id: 'u1', email: 'sender@example.com', name: 'Sue Sender' },
      signers: [{ id: 's1' }],
      documents: [{ id: 'd1' }],
      createdAt: '2025-01-01T00:00:00Z',
    })
    expect(out.id).toBe('tx_1')
    expect(out.platform).toBe('nitro-sign')
    expect(out.status).toBe('completed')
  })
})

describe('Nitro Sign webhook', () => {
  it('verifies x-nitro-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyNitroSignWebhook(body, { 'x-nitro-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=nitro-sign', () => {
    const out = parseNitroSignWebhookEvents({
      event: 'transaction.completed',
      data: { transaction: { id: 'tx_1' } },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('nitro-sign')
  })
})

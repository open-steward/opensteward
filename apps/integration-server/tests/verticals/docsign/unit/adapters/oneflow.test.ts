import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/oneflow/transform/envelope'
import {
  verifyOneflowWebhook,
  parseOneflowWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/oneflow/webhook'

describe('Oneflow transform', () => {
  it('maps a signed contract', () => {
    const out = transformEnvelope({
      id: 1234,
      name: 'NDA',
      state: 'signed',
      parties: [
        { id: 'pty_1', name: 'Acme', participants: [{ id: 1, email: 'a@example.com', signing_order: 1 }] },
      ],
      created_time: '2025-01-01T00:00:00Z',
    })
    expect(out.id).toBe('1234')
    expect(out.platform).toBe('oneflow')
    expect(out.status).toBe('completed')
  })
})

describe('Oneflow webhook', () => {
  it('verifies x-oneflow-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyOneflowWebhook(body, { 'x-oneflow-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=oneflow', () => {
    const out = parseOneflowWebhookEvents({
      event: 'contract.signed',
      data: { contract: { id: 1234 } },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('oneflow')
  })
})

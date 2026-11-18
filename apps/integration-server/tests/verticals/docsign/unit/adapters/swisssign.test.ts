import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/swisssign/transform/envelope'
import {
  verifySwissSignWebhook,
  parseSwissSignWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/swisssign/webhook'

describe('SwissSign transform', () => {
  it('maps a completed envelope', () => {
    const out = transformEnvelope({
      id: 'doc_1',
      name: 'NDA',
      status: 'COMPLETED',
      signers: [{ id: 's1', email: 'a@example.com', order: 1, status: 'SIGNED' }],
      documents: [{ id: 'd1' }],
      created_at: '2025-01-01T00:00:00Z',
    })
    expect(out.platform).toBe('swisssign')
    expect(out.status).toBe('completed')
  })
})

describe('SwissSign webhook', () => {
  it('verifies x-swisssign-signature HMAC', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifySwissSignWebhook(body, { 'x-swisssign-signature': sig }, secret)).toBe(true)
  })

  it('parses with platform=swisssign', () => {
    const out = parseSwissSignWebhookEvents({
      event: 'document.completed',
      data: { document: { id: 'doc_1' } },
    })
    expect(out[0]!.platform).toBe('swisssign')
  })
})

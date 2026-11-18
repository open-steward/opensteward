import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/scrive/transform/envelope'
import { EnvelopeSchema } from '../../../../../src/verticals/docsign/schema/envelope'
import {
  verifyScriveWebhook,
  parseScriveWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/scrive/webhook'

describe('Scrive transform', () => {
  it('maps a closed document (documented lower-case status, name/email fields)', () => {
    const out = EnvelopeSchema.parse(
      transformEnvelope({
        id: 'doc_1',
        title: 'NDA',
        status: 'closed',
        parties: [
          {
            id: 'p1',
            is_author: true,
            fields: [{ type: 'email', value: 'a@example.com' }],
            sign_order: 1,
            signatory_role: 'signing_party',
          },
          { id: 'p2', sign_order: 2, signatory_role: 'signing_party' },
        ],
        file: { id: 'f1', name: 'contract.pdf' },
        ctime: '2025-01-01T00:00:00Z',
      }),
    )
    expect(out.id).toBe('doc_1')
    expect(out.platform).toBe('scrive')
    expect(out.status).toBe('completed')
    expect(out.signingOrder).toBe('sequential')
    expect(out.senderEmail).toBe('a@example.com')
    expect(out.documentIds).toEqual(['f1'])
  })
})

describe('Scrive webhook', () => {
  it('verifies x-scrive-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyScriveWebhook(body, { 'x-scrive-signature': sig }, secret)).toBe(true)
  })

  it('parses a webhook event with platform=scrive', () => {
    const out = parseScriveWebhookEvents({
      event: 'document.closed',
      document: { id: 'doc_1' },
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]!.platform).toBe('scrive')
  })
})

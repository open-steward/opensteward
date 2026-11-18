import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/pandadoc/transform/envelope'
import { transformSigner } from '../../../../../src/verticals/docsign/adapters/pandadoc/transform/signer'
import {
  verifyPandaDocWebhook,
  parsePandaDocWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/pandadoc/webhook'

describe('PandaDoc transforms', () => {
  it('maps a sent document', () => {
    const out = transformEnvelope({
      id: 'doc_1',
      name: 'Contract',
      status: 'document.sent',
      sent_by: { id: 'u1', email: 'sender@example.com', first_name: 'Sue', last_name: 'Sender' },
      recipients: [{ id: 'r1', email: 'a@example.com', signing_order: 1, has_completed: false }],
      date_created: '2025-01-01T00:00:00Z',
    })
    expect(out.status).toBe('sent')
    expect(out.signerIds).toEqual(['r1'])
    expect(out.documentIds).toEqual(['doc_1'])
  })

  it('maps a completed recipient', () => {
    const out = transformSigner(
      {
        id: 'r1',
        email: 'a@example.com',
        first_name: 'A',
        last_name: 'Lice',
        has_completed: true,
        recipient_type: 'signer',
        signing_order: 1,
      },
      'doc_1',
    )
    expect(out.status).toBe('signed')
    expect(out.name).toBe('A Lice')
  })
})

describe('PandaDoc webhook', () => {
  it('verifies x-signature HMAC of body', () => {
    const secret = 'shh'
    const body = Buffer.from('[{"event":"document_state_changed"}]')
    const expected = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyPandaDocWebhook(body, { 'x-signature': expected }, secret)).toBe(true)
  })

  it('parses an array of events', () => {
    const out = parsePandaDocWebhookEvents([
      { event: 'document_state_changed', event_id: 'ev_1', data: { id: 'doc_1' } },
      {
        event: 'recipient_completed',
        event_id: 'ev_2',
        data: { id: 'doc_1', recipient: { id: 'r1' } },
      },
    ] as unknown as Record<string, unknown>)
    expect(out).toHaveLength(2)
    expect(out[1]!.resourceType).toBe('signers')
    expect(out[1]!.action).toBe('signed')
  })
})

import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/signnow/transform/envelope'
import { transformSigner } from '../../../../../src/verticals/docsign/adapters/signnow/transform/signer'
import {
  verifySignNowWebhook,
  parseSignNowWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/signnow/webhook'

describe('SignNow transforms', () => {
  it('maps a document with field_invites to envelope', () => {
    const out = transformEnvelope({
      id: 'doc_1',
      document_name: 'Contract',
      owner_email: 'sender@example.com',
      created: '1735689600',
      field_invites: [
        { id: 'fi_1', email: 'a@example.com', status: 'pending', order: 1, created: '1735689600' },
      ],
    })
    expect(out.signerIds).toEqual(['fi_1'])
    expect(out.status).toBe('sent')
    expect(out.platform).toBe('signnow')
  })

  it('maps a fulfilled field_invite to signed signer', () => {
    const out = transformSigner(
      {
        id: 'fi_1',
        email: 'a@example.com',
        status: 'fulfilled',
        order: 1,
        signature: { id: 's1', created: '1735776000' },
      },
      'doc_1',
    )
    expect(out.status).toBe('signed')
    expect(out.signedAt).toBe('2025-01-02T00:00:00.000Z')
  })
})

describe('SignNow webhook', () => {
  it('verifies x-signnow-signature HMAC', () => {
    const secret = 'shh'
    const body = Buffer.from('{"event":"document.complete"}')
    const expected = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifySignNowWebhook(body, { 'x-signnow-signature': expected }, secret)).toBe(true)
  })

  it('parses invite.fulfill → signers/signed', () => {
    const out = parseSignNowWebhookEvents({
      event_type: 'invite.fulfill',
      meta: { document_id: 'doc_1' },
    })
    expect(out[0]!.resourceType).toBe('signers')
    expect(out[0]!.action).toBe('signed')
    expect(out[0]!.envelopeId).toBe('doc_1')
  })
})

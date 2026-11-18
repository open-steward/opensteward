import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { transformEnvelope } from '../../../../../src/verticals/docsign/adapters/yousign/transform/envelope'
import { transformSigner } from '../../../../../src/verticals/docsign/adapters/yousign/transform/signer'
import {
  verifyYousignWebhook,
  parseYousignWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/yousign/webhook'

describe('Yousign transforms', () => {
  it('maps a signature_request', () => {
    const out = transformEnvelope({
      id: 'sr_1',
      name: 'NDA',
      status: 'ongoing',
      ordered_signers: true,
      signers: [{ id: 'sn_1' }],
      documents: [{ id: 'd_1' }],
      created_at: '2025-01-01T00:00:00Z',
    })
    expect(out.status).toBe('sent')
    expect(out.signingOrder).toBe('sequential')
    expect(out.signerIds).toEqual(['sn_1'])
  })

  it('maps a signed signer', () => {
    const out = transformSigner(
      {
        id: 'sn_1',
        info: { first_name: 'Alice', last_name: 'Doe', email: 'a@example.com' },
        status: 'signed',
        signature_order: 1,
        signed_at: '2025-01-02T00:00:00Z',
      },
      'sr_1',
    )
    expect(out.status).toBe('signed')
    expect(out.name).toBe('Alice Doe')
    expect(out.signedAt).toBe('2025-01-02T00:00:00.000Z')
  })
})

describe('Yousign webhook', () => {
  it('verifies X-Yousign-Signature-256 (sha256= prefix)', () => {
    const secret = 'shh'
    const body = Buffer.from('{"event_name":"signature_request.done"}')
    const expected = createHmac('sha256', secret).update(body).digest('hex')
    expect(
      verifyYousignWebhook(body, { 'x-yousign-signature-256': `sha256=${expected}` }, secret),
    ).toBe(true)
  })

  it('parses signer.signed → signers/signed', () => {
    const out = parseYousignWebhookEvents({
      event_name: 'signer.signed',
      data: { signature_request: { id: 'sr_1' }, signer: { id: 'sn_1' } },
    })
    expect(out[0]!.resourceType).toBe('signers')
    expect(out[0]!.action).toBe('signed')
    expect(out[0]!.envelopeId).toBe('sr_1')
  })
})

import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  transformEnvelope,
  type RawDropboxSignSignatureRequest,
} from '../../../../../src/verticals/docsign/adapters/dropbox-sign/transform/envelope'
import { transformSigner } from '../../../../../src/verticals/docsign/adapters/dropbox-sign/transform/signer'
import { transformTemplate } from '../../../../../src/verticals/docsign/adapters/dropbox-sign/transform/template'
import {
  verifyDropboxSignWebhook,
  parseDropboxSignWebhookEvents,
} from '../../../../../src/verticals/docsign/adapters/dropbox-sign/webhook'

describe('Dropbox Sign transforms', () => {
  it('maps a completed signature_request', () => {
    const raw: RawDropboxSignSignatureRequest = {
      signature_request_id: 'sr_1',
      subject: 'Sign please',
      is_complete: true,
      is_declined: false,
      has_error: false,
      requester_email_address: 'sender@example.com',
      signatures: [
        { signature_id: 'sig_1', signer_email_address: 'a@example.com', order: 0 },
      ],
      created_at: 1735689600,
    }
    const out = transformEnvelope(raw)
    expect(out.id).toBe('sr_1')
    expect(out.status).toBe('completed')
    expect(out.platform).toBe('dropbox-sign')
    expect(out.createdAt).toBe('2025-01-01T00:00:00.000Z')
  })

  it('maps a signer with signed_at', () => {
    const out = transformSigner(
      {
        signature_id: 'sig_1',
        signer_email_address: 'a@example.com',
        signer_name: 'Alice',
        status_code: 'signed',
        signed_at: 1735776000,
        order: 0,
      },
      { signature_request_id: 'sr_1' } as RawDropboxSignSignatureRequest,
    )
    expect(out.status).toBe('signed')
    expect(out.signedAt).toBe('2025-01-02T00:00:00.000Z')
    expect(out.routingOrder).toBe(1)
  })

  it('maps a template', () => {
    const out = transformTemplate({
      template_id: 'tpl_1',
      title: 'NDA',
      signer_roles: [{ name: 'Counterparty' }, { name: 'Recipient' }],
      documents: [{}],
      created_at: 1735689600,
    })
    expect(out.signerRoles).toEqual(['Counterparty', 'Recipient'])
    expect(out.documentCount).toBe(1)
  })
})

describe('Dropbox Sign webhook', () => {
  it('verifies in-body event_hash HMAC of <event_time><event_type>', () => {
    const secret = 'topsecret'
    const eventTime = '1735689600'
    const eventType = 'signature_request_signed'
    const expectedHash = createHmac('sha256', secret)
      .update(`${eventTime}${eventType}`)
      .digest('hex')
    const body = Buffer.from(
      JSON.stringify({
        event: { event_time: eventTime, event_type: eventType, event_hash: expectedHash },
        signature_request: { signature_request_id: 'sr_1' },
      }),
    )
    expect(verifyDropboxSignWebhook(body, {}, secret)).toBe(true)
  })

  it('rejects an incorrect hash', () => {
    const body = Buffer.from(
      JSON.stringify({
        event: { event_time: '0', event_type: 'signature_request_signed', event_hash: 'bad' },
      }),
    )
    expect(verifyDropboxSignWebhook(body, {}, 'right')).toBe(false)
  })

  it('parses signature_request_signed → signers/signed', () => {
    const out = parseDropboxSignWebhookEvents({
      event: { event_time: '0', event_type: 'signature_request_signed', event_hash: 'x' },
      signature_request: { signature_request_id: 'sr_1' },
    })
    expect(out[0]!.resourceType).toBe('signers')
    expect(out[0]!.action).toBe('signed')
    expect(out[0]!.envelopeId).toBe('sr_1')
  })
})

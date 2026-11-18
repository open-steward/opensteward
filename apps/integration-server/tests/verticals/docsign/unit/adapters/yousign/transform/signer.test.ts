/**
 * Yousign `GET /signature_requests/{signatureRequestId}/signers` → canonical Signer.
 *
 * https://developers.youtrust.com/reference/get-signature_requests-signaturerequestid-signers-1.md
 * The 200 response is `{"items":{"$ref":"#/components/schemas/Signer"},"type":"array"}`.
 * `Signer.status` is documented as
 *   "enum":["initiated","declined","notified","verified","processing","consent_given","signed","aborted","error"]
 * and `Signer_info` requires `email`, `first_name`, `last_name`, `locale`, `phone_number`.
 *
 * The fixture is built from the documented `Signer` schema and carries every
 * property in its `required` list, using the schema's own examples where it
 * gives one (`signed_at`: "2024-01-18T22:59:00Z"; `Signer_redirect_urls`:
 * "https://example.com/success" / "/error" / "/decline"; `DisabledSigningContexts`
 * default `[]`). `CustomText` and `OtpMessage` fields are documented nullable.
 */
import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawYousignSigner,
} from '../../../../../../../src/verticals/docsign/adapters/yousign/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

const SR = '9a93d3b5-fb3b-4abf-9e70-26315b33506c'

function documentedSigner(over: Partial<RawYousignSigner> = {}): RawYousignSigner {
  return {
    id: '44e4b0f8-55c9-48a9-803f-d89957525270',
    info: {
      first_name: 'Johnny',
      last_name: 'Wallyday',
      email: 'johnny.wallyday@example.com',
      phone_number: '+447123456789',
      locale: 'fr',
    },
    status: 'signed',
    fields: [],
    signature_level: 'electronic_signature',
    signature_authentication_mode: 'otp_email',
    signature_link: null,
    signature_link_expiration_date: null,
    signature_image_preview: null,
    delivery_mode: 'email',
    identification_attestation_id: null,
    pre_identity_verification_required: false,
    verified_identity_id: null,
    recipient_stage_index: 0,
    excluded_documents: [],
    signed_at: '2024-01-18T22:59:00Z',
    custom_text: {
      request_subject: null,
      request_body: null,
      reminder_subject: null,
      reminder_body: null,
    },
    redirect_urls: {
      success: 'https://example.com/success',
      error: 'https://example.com/error',
      decline: 'https://example.com/decline',
    },
    sms_notification: { otp_message: { custom_text: null } },
    email_notification: { disabled: [] },
    disabled_signing_contexts: [],
    ...over,
  }
}

describe('Yousign transformSigner', () => {
  it('invents no name: a Signer with neither first_name nor last_name throws', () => {
    const info = { email: 'johnny.wallyday@example.com', phone_number: null, locale: 'fr' }
    expect(() => transformSigner(documentedSigner({ info }), SR)).toThrow(
      /no documented info.first_name or info.last_name/,
    )
  })

  it('maps a documented Signer to a valid canonical Signer', () => {
    const out = SignerSchema.parse(transformSigner(documentedSigner(), SR))
    expect(out.id).toBe('44e4b0f8-55c9-48a9-803f-d89957525270')
    expect(out.externalId).toBe(out.id)
    expect(out.envelopeId).toBe(SR)
    expect(out.email).toBe('johnny.wallyday@example.com')
    expect(out.name).toBe('Johnny Wallyday')
    expect(out.role).toBe('signer')
    expect(out.status).toBe('signed')
    expect(out.signedAt).toBe('2024-01-18T22:59:00.000Z')
    expect(out.metadata).toEqual({
      status: 'signed',
      signatureLevel: 'electronic_signature',
      authenticationMode: 'otp_email',
      deliveryMode: 'email',
      locale: 'fr',
      recipientStageIndex: '0',
    })
  })

  it('does not claim a routing order: the base of recipient_stage_index is undocumented', () => {
    const out = SignerSchema.parse(
      transformSigner(documentedSigner({ recipient_stage_index: 3 }), SR),
    )
    expect(out.routingOrder).toBeUndefined()
    expect(out.metadata['recipientStageIndex']).toBe('3')
  })

  it.each([
    ['initiated', 'created'],
    ['notified', 'sent'],
    ['consent_given', 'delivered'],
    ['signed', 'signed'],
    ['declined', 'declined'],
    ['verified', 'unknown'],
    ['processing', 'unknown'],
    ['aborted', 'unknown'],
    ['error', 'unknown'],
  ] as const)('maps the documented status %s to %s', (status, expected) => {
    const out = SignerSchema.parse(
      transformSigner(documentedSigner({ status, signed_at: null }), SR),
    )
    expect(out.status).toBe(expected)
    expect(out.metadata['status']).toBe(status)
  })

  it('omits email rather than emitting an empty string when info carries none', () => {
    const raw = documentedSigner()
    const out = SignerSchema.parse(
      transformSigner({ ...raw, info: { ...raw.info!, email: undefined } }, SR),
    )
    expect(out.email).toBeUndefined()
  })

  it('an unsigned signer (signed_at: null) has no signedAt', () => {
    const out = SignerSchema.parse(
      transformSigner(documentedSigner({ status: 'notified', signed_at: null }), SR),
    )
    expect(out.signedAt).toBeUndefined()
  })
})

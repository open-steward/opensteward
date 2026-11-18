/**
 * DigiSigner invited signer → canonical Signer.
 *
 * Source: https://www.digisigner.com/esignature-api/esignature-api-documentation/
 * "signers[] array Array of invited signers
 *  ├ email string Signer email address
 *  ├ is_signature_completed boolean If particular signer completed particular document
 *  └ sign_document_url string URL of the DigiSigner signing page"
 * and on the request: "send_emails (optional) boolean If invitation and
 * notification emails are sent (default: true)".
 */
import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/digisigner/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import {
  documentedSignatureRequest,
  DOC_DOCUMENT_ID,
  DOC_REQ_ID,
  DOC_SIGNER_EMAIL,
} from '../fixture'

const signer = () => documentedSignatureRequest().documents![0]!.signers![0]!

describe('digisigner transformSigner', () => {
  it('maps the documented sample signer and parses with SignerSchema', () => {
    const s = SignerSchema.parse(transformSigner(signer(), DOC_REQ_ID, DOC_DOCUMENT_ID, true))
    expect(s.id).toBe(`${DOC_REQ_ID}:${DOC_DOCUMENT_ID}:${DOC_SIGNER_EMAIL}`)
    expect(s.externalId).toBe(`${DOC_DOCUMENT_ID}:${DOC_SIGNER_EMAIL}`)
    expect(s.envelopeId).toBe(DOC_REQ_ID)
    expect(s.email).toBe(DOC_SIGNER_EMAIL)
    expect(s.name).toBe(DOC_SIGNER_EMAIL)
    expect(s.role).toBe('signer')
    expect(s.status).toBe('sent')
    expect(s.metadata).toMatchObject({ documentId: DOC_DOCUMENT_ID })
    expect(s.platform).toBe('digisigner')
  })

  it('is_signature_completed true is signed', () => {
    const raw = { ...signer(), is_signature_completed: true }
    expect(SignerSchema.parse(transformSigner(raw, DOC_REQ_ID, DOC_DOCUMENT_ID, true)).status).toBe(
      'signed',
    )
  })

  it('an unsigned signer on a send_emails=false request was never emailed: created', () => {
    expect(transformSigner(signer(), DOC_REQ_ID, DOC_DOCUMENT_ID, false).status).toBe('created')
  })

  it('keeps the echoed order and role in metadata', () => {
    const raw = { ...signer(), order: 2, role: 'Buyer' }
    expect(transformSigner(raw, DOC_REQ_ID, DOC_DOCUMENT_ID, true).metadata).toEqual({
      documentId: DOC_DOCUMENT_ID,
      order: '2',
      role: 'Buyer',
    })
  })

  it('never carries the signing link in raw', () => {
    const s = transformSigner(signer(), DOC_REQ_ID, DOC_DOCUMENT_ID, true)
    expect(JSON.stringify(s.raw)).not.toContain('sign_document_url')
    expect(JSON.stringify(s.raw)).not.toContain('invitationId')
  })

  it('throws when email is missing', () => {
    expect(() =>
      transformSigner({ is_signature_completed: false }, DOC_REQ_ID, DOC_DOCUMENT_ID, true),
    ).toThrow(/email/)
  })
})

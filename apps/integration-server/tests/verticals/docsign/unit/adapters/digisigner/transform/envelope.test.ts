/**
 * DigiSigner signature request → canonical Envelope.
 *
 * Source: https://www.digisigner.com/esignature-api/esignature-api-documentation/
 * "Get Signature Request Status" response parameters:
 *   signature_request_id string Signature request id
 *   is_completed boolean If all signers completed all documents
 *   documents[] ├ document_id string Document id └ signers[] ├ email ...
 */
import { describe, it, expect } from 'vitest'
import { transformEnvelope } from '../../../../../../../src/verticals/docsign/adapters/digisigner/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'
import {
  documentedSignatureRequest,
  DOC_DOCUMENT_ID,
  DOC_REQ_ID,
  DOC_SIGNER_EMAIL,
} from '../fixture'

describe('digisigner transformEnvelope', () => {
  it('maps the documented sample response and parses with EnvelopeSchema', () => {
    const e = EnvelopeSchema.parse(transformEnvelope(documentedSignatureRequest()))
    expect(e.id).toBe(DOC_REQ_ID)
    expect(e.externalId).toBe(DOC_REQ_ID)
    expect(e.status).toBe('sent')
    expect(e.signingOrder).toBe('parallel')
    expect(e.documentIds).toEqual([`${DOC_REQ_ID}:${DOC_DOCUMENT_ID}`])
    expect(e.signerIds).toEqual([`${DOC_REQ_ID}:${DOC_DOCUMENT_ID}:${DOC_SIGNER_EMAIL}`])
    expect(e.platform).toBe('digisigner')
    expect(e.metadata).toMatchObject({ send_emails: 'true', embedded: 'false' })
  })

  it('is_completed true is completed', () => {
    const raw = { ...documentedSignatureRequest(), is_completed: true }
    expect(EnvelopeSchema.parse(transformEnvelope(raw)).status).toBe('completed')
  })

  it('signers carrying distinct documented `order` values are sequential', () => {
    const raw = documentedSignatureRequest()
    raw.documents![0]!.signers = [
      { email: 'a@example.com', order: 1, is_signature_completed: false },
      { email: 'b@example.com', order: 2, is_signature_completed: false },
    ]
    expect(EnvelopeSchema.parse(transformEnvelope(raw)).signingOrder).toBe('sequential')
  })

  it('signers sharing one `order` have nothing to sequence: parallel', () => {
    const raw = documentedSignatureRequest()
    raw.documents![0]!.signers = [
      { email: 'a@example.com', order: 1, is_signature_completed: false },
      { email: 'b@example.com', order: 1, is_signature_completed: false },
    ]
    expect(EnvelopeSchema.parse(transformEnvelope(raw)).signingOrder).toBe('parallel')
  })

  it('send_emails omitted: still sent, and no send_emails metadata is invented', () => {
    const { send_emails: _omit, ...raw } = documentedSignatureRequest()
    const e = EnvelopeSchema.parse(transformEnvelope(raw))
    expect(e.status).toBe('sent')
    expect(e.metadata['send_emails']).toBeUndefined()
  })

  it('never carries the signing link in raw', () => {
    const e = transformEnvelope(documentedSignatureRequest())
    expect(JSON.stringify(e.raw)).not.toContain('sign_document_url')
    expect(JSON.stringify(e.raw)).not.toContain('invitationId')
  })

  it('throws when the response has no signature_request_id', () => {
    const raw = { ...documentedSignatureRequest(), signature_request_id: undefined }
    expect(() => transformEnvelope(raw)).toThrow(/signature_request_id/)
  })
})

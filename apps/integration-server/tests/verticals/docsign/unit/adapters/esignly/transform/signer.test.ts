/**
 * Fixture: the documented success example of "Get Document status"
 * (POST /v1/checkSignStatus/) in eSignly's API reference,
 * https://www.esignly.com/eSignlyDec16-postmanCollection.json (rendered at
 * https://www.esignly.com/api-docs.html), copied verbatim.
 */
import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/esignly/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { CHECK_SIGN_STATUS_EXAMPLE } from '../check-sign-status.fixture'

const REQ = CHECK_SIGN_STATUS_EXAMPLE.signature_request.signature_request_id

describe('esignly transformSigner (checkSignStatus signatures[])', () => {
  it('maps the documented example signature', () => {
    const raw = CHECK_SIGN_STATUS_EXAMPLE.signatures[0]!
    const result = SignerSchema.parse(transformSigner(raw, REQ))

    expect(result.id).toBe(`${REQ}:142692`)
    expect(result.externalId).toBe('142692')
    expect(result.envelopeId).toBe(REQ)
    expect(result.email).toBe('example@example.com')
    expect(result.name).toBe('')
    expect(result.role).toBe('signer')
    expect(result.status).toBe('sent')
    expect(result.metadata).toEqual({ userKey: '707319997', statusCode: 'SENT' })
    expect(result.platform).toBe('esignly')
    expect(result.raw).toBe(raw)
  })

  it('maps every documented signature and keeps ids distinct', () => {
    const rows = CHECK_SIGN_STATUS_EXAMPLE.signatures.map((s) =>
      SignerSchema.parse(transformSigner(s, REQ)),
    )
    expect(rows.map((r) => r.externalId)).toEqual(['142692', '142693'])
  })

  it.each(['VIEWED', 'SIGNED', 'sent'])(
    'surfaces the undocumented wire code %s as unknown (only "SENT" is documented)',
    (code) => {
      const raw = { ...CHECK_SIGN_STATUS_EXAMPLE.signatures[0]!, status_code: code }
      const result = SignerSchema.parse(transformSigner(raw, REQ))
      expect(result.status).toBe('unknown')
      expect(result.metadata).toMatchObject({ statusCode: code })
    },
  )

  it('surfaces an undescribed status_code as unknown instead of guessing', () => {
    const raw = { ...CHECK_SIGN_STATUS_EXAMPLE.signatures[0]!, status_code: 'SOMETHING_NEW' }
    expect(SignerSchema.parse(transformSigner(raw, REQ)).status).toBe('unknown')
  })

  it('omits email when signer_email_address is empty', () => {
    const raw = { ...CHECK_SIGN_STATUS_EXAMPLE.signatures[0]!, signer_email_address: '' }
    const result = SignerSchema.parse(transformSigner(raw, REQ))
    expect(result).not.toHaveProperty('email')
  })

  it('throws rather than inventing an id when signature_id is missing', () => {
    const { signature_id: _omit, ...raw } = CHECK_SIGN_STATUS_EXAMPLE.signatures[0]!
    expect(() => transformSigner(raw, REQ)).toThrow(/signature_id/)
  })
})

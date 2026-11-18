import { describe, it, expect } from 'vitest'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/rightsignature/transform/signer'
import { SHOW_DOCUMENT, SIGNED_RECIPIENT } from '../fixtures'

const DOC_ID = SHOW_DOCUMENT.document.id

describe('RightSignature transformSigner (documents show recipients[])', () => {
  it('maps a documented recipient onto the canonical Signer', () => {
    const out = SignerSchema.parse(transformSigner(SHOW_DOCUMENT.document.recipients[0]!, DOC_ID))
    expect(out).toMatchObject({
      id: `${DOC_ID}:c76fad94-749b-495b-b088-c184282072e4`,
      externalId: 'c76fad94-749b-495b-b088-c184282072e4',
      envelopeId: DOC_ID,
      email: 'susie@citrix.com',
      name: 'Susie Orange',
      role: 'signer',
      platform: 'rightsignature',
      metadata: { status: 'pending', role_name: 'signer2', sequence: '1' },
    })
  })

  it('does not guess a canonical status for "pending", and emits no routing order', () => {
    const out = SignerSchema.parse(transformSigner(SHOW_DOCUMENT.document.recipients[1]!, DOC_ID))
    expect(out.status).toBe('unknown')
    expect(out.routingOrder).toBeUndefined()
  })

  it('maps the documented "signed" status', () => {
    const out = SignerSchema.parse(transformSigner(SIGNED_RECIPIENT, DOC_ID))
    expect(out.status).toBe('signed')
  })

  it('keeps the sign_url access token out of raw', () => {
    const out = transformSigner(SHOW_DOCUMENT.document.recipients[0]!, DOC_ID)
    expect(JSON.stringify(out)).not.toContain('access_token')
    expect(JSON.stringify(out)).not.toContain('sign_url')
  })

  it('omits an empty email instead of failing the schema', () => {
    const out = SignerSchema.parse(transformSigner({ ...SIGNED_RECIPIENT, email: '' }, DOC_ID))
    expect(out.email).toBeUndefined()
  })

  it('throws on a recipient with no id', () => {
    expect(() => transformSigner({ ...SIGNED_RECIPIENT, id: '' }, DOC_ID)).toThrow(/no id/)
  })

  it('throws on a recipient with no name rather than inventing one', () => {
    const { name: _omit, ...noName } = SIGNED_RECIPIENT
    expect(() => transformSigner(noName, DOC_ID)).toThrow(/no name/)
    expect(() => transformSigner({ ...SIGNED_RECIPIENT, name: '' }, DOC_ID)).toThrow(/no name/)
  })
})

import { describe, it, expect } from 'vitest'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/scrive/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { documentExample } from '../fixtures'

describe('scrive transformSigner (documented Signatory example)', () => {
  const doc = documentExample()
  const [author, signer] = doc.parties!

  it('maps the signing party', () => {
    const out = SignerSchema.parse(transformSigner(signer!, doc.id, doc.status))
    expect(out.id).toBe('189256')
    expect(out.envelopeId).toBe('8222115557375075439')
    expect(out.email).toBe('noemail@scrive.com')
    expect(out.name).toBe('Magnus Söderholm')
    expect(out.role).toBe('signer')
    expect(out.status).toBe('signed')
    expect(out.signedAt).toBe('2017-01-13T10:38:49.590Z')
    expect(out.routingOrder).toBe(1)
    expect(out.metadata.authMethodSign).toBe('onfido')
  })

  it('maps the author viewer as cc', () => {
    const out = SignerSchema.parse(transformSigner(author!, doc.id, 'pending'))
    expect(out.role).toBe('cc')
    expect(out.email).toBe('noreply@scrive.com')
    expect(out.status).toBe('sent')
    expect(out.metadata.isAuthor).toBe('true')
  })

  it('reads rejected_time and rejection_reason', () => {
    const out = SignerSchema.parse(
      transformSigner(
        {
          ...signer!,
          sign_time: null,
          seen_time: null,
          rejected_time: '2017-01-14T10:00:00Z',
          rejection_reason: 'No',
        },
        doc.id,
        'rejected',
      ),
    )
    expect(out.status).toBe('declined')
    expect(out.declinedAt).toBe('2017-01-14T10:00:00.000Z')
    expect(out.declineReason).toBe('No')
  })

  it('reads seen_time as delivered and a preparation document as created', () => {
    expect(transformSigner({ ...signer!, sign_time: null }, doc.id, 'pending').status).toBe(
      'delivered',
    )
    expect(
      transformSigner({ ...signer!, sign_time: null, seen_time: null }, doc.id, 'preparation')
        .status,
    ).toBe('created')
  })

  it('is_signatory false takes precedence over signatory_role', () => {
    const out = SignerSchema.parse(
      transformSigner({ ...signer!, is_signatory: false, signatory_role: 'signing_party' }, doc.id),
    )
    expect(out.role).toBe('cc')
  })

  it('reads read_invitation_time as deliveredAt', () => {
    const out = SignerSchema.parse(
      transformSigner({ ...signer!, read_invitation_time: '2017-01-13T10:38:20Z' }, doc.id),
    )
    expect(out.deliveredAt).toBe('2017-01-13T10:38:20.000Z')
  })

  it('skips an empty name field instead of joining it', () => {
    const out = SignerSchema.parse(
      transformSigner(
        {
          id: 'p',
          fields: [
            { type: 'name', order: 1, value: 'Magnus' },
            { type: 'name', order: 2, value: '' },
          ],
        },
        doc.id,
      ),
    )
    expect(out.name).toBe('Magnus')
  })

  it('omits email when the email field is empty', () => {
    const out = SignerSchema.parse(
      transformSigner(
        { id: 'p', fields: [{ type: 'email', value: '' }], signatory_role: 'approver' },
        doc.id,
      ),
    )
    expect(out).not.toHaveProperty('email')
    expect(out.role).toBe('approver')
  })
})

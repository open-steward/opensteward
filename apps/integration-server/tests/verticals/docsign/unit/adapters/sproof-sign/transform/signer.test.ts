import { describe, it, expect } from 'vitest'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'
import { transformSigner } from '../../../../../../../src/verticals/docsign/adapters/sproof-sign/transform/signer'
import { MEMBER_EXAMPLE, signerMember } from '../fixtures'

/** `_Member` entries of `_Document.members` ("A list of invited contacts"). */
describe('sproof-sign transformSigner', () => {
  it('maps the documented _Member example and parses with SignerSchema', () => {
    const out = SignerSchema.parse(transformSigner(MEMBER_EXAMPLE, 'env1', 'pending'))
    expect(out.id).toBe(`env1:${MEMBER_EXAMPLE.id}`)
    expect(out.externalId).toBe(MEMBER_EXAMPLE.id)
    expect(out.envelopeId).toBe('env1')
    expect(out.email).toBe('max.mustermann@sproof.com')
    expect(out.name).toBe('Max Mustermann')
    expect(out.routingOrder).toBe(1)
    // isSigner/isApprover/isViewer are all false in the example.
    expect(out.role).toBe('unknown')
    // Not signed, not declined, not viewed, and the document is pending: the
    // spec says nothing about whether this member has been invited yet.
    expect(out.status).toBe('unknown')
    expect(out.platform).toBe('sproof-sign')
  })

  it('maps a signed signer', () => {
    const out = SignerSchema.parse(transformSigner(signerMember(1), 'env1', 'pending'))
    expect(out.role).toBe('signer')
    expect(out.status).toBe('signed')
    expect(out.signedAt).toBe('2023-05-26T08:03:42.946Z')
  })

  it('maps a declined signer', () => {
    const raw = signerMember(1, {
      signed: false,
      signedAt: null,
      declinedAt: '2022-04-05T08:58:04.206Z',
    })
    const out = SignerSchema.parse(transformSigner(raw, 'env1', 'declined'))
    expect(out.status).toBe('declined')
    expect(out.declinedAt).toBe('2022-04-05T08:58:04.206Z')
  })

  it('maps an approver who approved and a viewer who viewed', () => {
    const approver = SignerSchema.parse(
      transformSigner(
        signerMember(1, {
          isSigner: false,
          isApprover: true,
          signed: false,
          signedAt: null,
          approvedAt: '2022-04-05T08:58:04.206Z',
        }),
        'env1',
        'pending',
      ),
    )
    expect(approver.role).toBe('approver')
    expect(approver.status).toBe('signed')
    expect(approver.signedAt).toBe('2022-04-05T08:58:04.206Z')
    const viewer = SignerSchema.parse(
      transformSigner(
        signerMember(2, {
          isSigner: false,
          isViewer: true,
          signed: false,
          signedAt: null,
          viewedAt: '2022-04-05T08:58:04.206Z',
        }),
        'env1',
        'pending',
      ),
    )
    expect(viewer.role).toBe('cc')
    expect(viewer.status).toBe('delivered')
    expect(viewer.deliveredAt).toBe('2022-04-05T08:58:04.206Z')
  })

  it('does not read _Member.signed ("signed by the owner") as this member signing', () => {
    const raw = signerMember(1, { signed: true, signedAt: null })
    const out = SignerSchema.parse(transformSigner(raw, 'env1', 'pending'))
    expect(out.status).toBe('unknown')
    expect(out.signedAt).toBeUndefined()
  })

  it('reports members of a draft as created', () => {
    const raw = signerMember(1, { signed: false, signedAt: null })
    expect(SignerSchema.parse(transformSigner(raw, 'env1', 'draft')).status).toBe('created')
  })

  it('throws rather than invent an id when the member id is missing', () => {
    expect(() => transformSigner({ ...MEMBER_EXAMPLE, id: undefined }, 'env1', 'pending')).toThrow(
      /member id/,
    )
  })
})

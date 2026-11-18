import { describe, it, expect } from 'vitest'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'
import { transformEnvelope } from '../../../../../../../src/verticals/docsign/adapters/sproof-sign/transform/envelope'
import { DOCUMENT_EXAMPLE, MEMBER_EXAMPLE, signerMember } from '../fixtures'

/**
 * `_Document` from GET /documents and GET /documents/{memberId}
 * (https://sign.sproof.com/api/v1/documentation/json). A sproof document is one
 * file sent to its members, so it maps to one canonical Envelope, keyed by the
 * owner's member id: GET /documents/{memberId} is the only documented read.
 */
describe('sproof-sign transformEnvelope', () => {
  it('maps the documented _Document example and parses with EnvelopeSchema', () => {
    const out = EnvelopeSchema.parse(transformEnvelope(DOCUMENT_EXAMPLE))
    expect(out.id).toBe(MEMBER_EXAMPLE.id)
    expect(out.externalId).toBe(MEMBER_EXAMPLE.id)
    expect(out.subject).toBe('important_contract')
    expect(out.status).toBe('sent')
    expect(out.senderEmail).toBe('max.mustermann@sproof.com')
    expect(out.senderName).toBe('Max Mustermann')
    expect(out.createdAt).toBe('2022-03-28T14:36:06.314Z')
    expect(out.updatedAt).toBe('2022-03-28T14:40:06.698Z')
    expect(out.signerIds).toEqual([])
    expect(out.documentIds).toEqual([`${MEMBER_EXAMPLE.id}:${DOCUMENT_EXAMPLE.id}`])
    expect(out.metadata).toEqual(
      expect.objectContaining({
        documentId: DOCUMENT_EXAMPLE.id,
        refId: 'Aug24-1234',
        state: 'pending',
      }),
    )
    expect(out.platform).toBe('sproof-sign')
  })

  it.each([
    ['draft', 'draft'],
    ['pending', 'sent'],
    ['manuallyPending', 'sent'],
    ['declined', 'declined'],
    ['completed', 'completed'],
    ['manuallyCompleted', 'completed'],
    ['attachment', 'unknown'],
    ['somethingNew', 'unknown'],
  ])('maps documented state %s to %s', (state, status) => {
    expect(EnvelopeSchema.parse(transformEnvelope({ ...DOCUMENT_EXAMPLE, state })).status).toBe(
      status,
    )
  })

  it('lists members as signer ids scoped to the envelope', () => {
    const out = EnvelopeSchema.parse(
      transformEnvelope({ ...DOCUMENT_EXAMPLE, members: [signerMember(1), signerMember(2)] }),
    )
    expect(out.signerIds).toEqual([`${MEMBER_EXAMPLE.id}:member1`, `${MEMBER_EXAMPLE.id}:member2`])
  })

  it('is parallel when every member shares a signingOrder, sequential otherwise', () => {
    const same = transformEnvelope({
      ...DOCUMENT_EXAMPLE,
      members: [signerMember(1), signerMember(2)],
    })
    const diff = transformEnvelope({
      ...DOCUMENT_EXAMPLE,
      members: [signerMember(1), signerMember(2, { signingOrder: 2 })],
    })
    expect(EnvelopeSchema.parse(same).signingOrder).toBe('parallel')
    expect(EnvelopeSchema.parse(diff).signingOrder).toBe('sequential')
  })

  it('throws rather than invent an id when the owner member id is missing', () => {
    expect(() =>
      transformEnvelope({ ...DOCUMENT_EXAMPLE, member: { ...MEMBER_EXAMPLE, id: undefined } }),
    ).toThrow(/member\.id/)
  })
})

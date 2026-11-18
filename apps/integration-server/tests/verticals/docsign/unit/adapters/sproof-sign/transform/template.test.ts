import { describe, it, expect } from 'vitest'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'
import { transformTemplate } from '../../../../../../../src/verticals/docsign/adapters/sproof-sign/transform/template'
import { DOCUMENT_EXAMPLE, MEMBER_EXAMPLE, signerMember } from '../fixtures'

/** Templates are `_Document`s returned by GET /documents?view=templates. */
describe('sproof-sign transformTemplate', () => {
  it('maps the documented _Document example and parses with TemplateSchema', () => {
    const out = TemplateSchema.parse(transformTemplate(DOCUMENT_EXAMPLE))
    expect(out.id).toBe(MEMBER_EXAMPLE.id)
    expect(out.externalId).toBe(MEMBER_EXAMPLE.id)
    expect(out.name).toBe('important_contract')
    expect(out.documentCount).toBe(1)
    expect(out.signerRoles).toEqual([])
    expect(out.createdAt).toBe('2022-03-28T14:36:06.314Z')
    expect(out.updatedAt).toBe('2022-03-28T14:40:06.698Z')
    expect(out.metadata).toEqual(expect.objectContaining({ documentId: DOCUMENT_EXAMPLE.id }))
    expect(out.platform).toBe('sproof-sign')
  })

  it('lists each documented member role once', () => {
    const out = TemplateSchema.parse(
      transformTemplate({
        ...DOCUMENT_EXAMPLE,
        members: [
          signerMember(1),
          signerMember(2),
          signerMember(3, { isSigner: false, isApprover: true }),
        ],
      }),
    )
    expect(out.signerRoles).toEqual(['signer', 'approver'])
  })

  it('throws rather than invent an id when the owner member id is missing', () => {
    expect(() =>
      transformTemplate({ ...DOCUMENT_EXAMPLE, member: { ...MEMBER_EXAMPLE, id: undefined } }),
    ).toThrow(/member\.id/)
  })
})

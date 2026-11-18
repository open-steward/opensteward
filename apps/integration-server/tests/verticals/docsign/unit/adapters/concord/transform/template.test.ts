import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  transformTemplateAgreement,
} from '../../../../../../../src/verticals/docsign/adapters/concord/transform/template'
import type {
  RawConcordAgreement,
  RawConcordAgreementListItem,
} from '../../../../../../../src/verticals/docsign/adapters/concord/transform/envelope'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'
import { AGREEMENT_LIST_ITEM_EXAMPLE, GET_AGREEMENT_EXAMPLE } from './fixtures'

const item = {
  ...AGREEMENT_LIST_ITEM_EXAMPLE,
  status: 'TEMPLATE_AUTO',
} as RawConcordAgreementListItem
const agreement = {
  ...GET_AGREEMENT_EXAMPLE,
  metadata: { ...GET_AGREEMENT_EXAMPLE.metadata, status: 'TEMPLATE' },
} as unknown as RawConcordAgreement

describe('concord transformTemplate', () => {
  it('maps a TEMPLATE_AUTO list item onto the canonical schema', () => {
    const out = TemplateSchema.parse(transformTemplate(item, 3))
    expect(out.id).toBe('01sp9L4YEZNcLHaSV8447N')
    expect(out.name).toBe('Non')
    expect(out.description).toBe('NDA')
    expect(out.signerRoles).toEqual([])
    expect(out.documentCount).toBe(3)
    expect(out.createdAt).toBe('2016-02-29T16:39:42.000Z')
    expect(out.updatedAt).toBe('2016-02-29T16:39:42.000Z')
    expect(out.metadata).toEqual({
      concordStatus: 'TEMPLATE_AUTO',
      createdBy: '123',
      createdByName: 'John doe',
      organizationId: '1',
      folderId: '123',
    })
  })

  it('maps a TEMPLATE GetAgreement reply', () => {
    const out = TemplateSchema.parse(transformTemplateAgreement(agreement, 0))
    expect(out.name).toBe('Non-Disclosure Agreement')
    expect(out.description).toBe('This NDA covers the company for 10 years.')
    expect(out.createdAt).toBe('2016-02-29T16:39:42.000Z')
    expect(out.documentCount).toBe(0)
    expect(out.metadata['concordStatus']).toBe('TEMPLATE')
  })

  it('refuses an agreement that is not in a template stage with a 404', () => {
    expect(() =>
      transformTemplate(AGREEMENT_LIST_ITEM_EXAMPLE as RawConcordAgreementListItem, 1),
    ).toThrow(expect.objectContaining({ statusCode: 404 }))
    expect(() =>
      transformTemplateAgreement(GET_AGREEMENT_EXAMPLE as unknown as RawConcordAgreement, 1),
    ).toThrow(/not a template/)
  })

  it('throws rather than invent a document count', () => {
    expect(() => transformTemplate(item, Number.NaN)).toThrow(/attachment count/)
    expect(() => transformTemplate(item, -1)).toThrow(/attachment count/)
  })
})

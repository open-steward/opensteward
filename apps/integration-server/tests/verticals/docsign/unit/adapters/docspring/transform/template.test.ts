import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawDocSpringTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/docspring/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'
import { TEMPLATE_EXAMPLE, TEMPLATES_EXAMPLE } from '../fixtures'

describe('docspring transformTemplate', () => {
  it('maps the documented GET /templates/{id} example', () => {
    const out = TemplateSchema.parse(
      transformTemplate(TEMPLATE_EXAMPLE as unknown as RawDocSpringTemplate),
    )
    expect(out.id).toBe('tpl_1234567890abcdef01')
    expect(out.externalId).toBe('tpl_1234567890abcdef01')
    expect(out.name).toBe('Template 1')
    expect(out.description).toBeUndefined()
    expect(out.signerRoles).toEqual([])
    expect(out.documentCount).toBe(1)
    expect(out.createdAt).toBeUndefined()
    expect(out.updatedAt).toBe('2018-10-20T13:00:00.000Z')
    expect(out.metadata).toEqual({ templateType: 'pdf', pageCount: '1' })
    expect(out.platform).toBe('docspring')
  })

  it('maps every element of the documented GET /templates array', () => {
    const out = (TEMPLATES_EXAMPLE as unknown as RawDocSpringTemplate[]).map((t) =>
      TemplateSchema.parse(transformTemplate(t)),
    )
    expect(out.map((t) => t.id)).toEqual([
      'tpl_1234567890abcdef04',
      'tpl_1234567890abcdef03',
      'tpl_1234567890abcdef02',
      'tpl_1234567890abcdef01',
    ])
    // The HTML template in the example has no document_filename.
    expect(out.map((t) => t.documentCount)).toEqual([1, 0, 1, 1])
  })

  it('reads a non-null description', () => {
    const raw = {
      ...TEMPLATE_EXAMPLE,
      description: 'Onboarding packet',
    } as unknown as RawDocSpringTemplate
    expect(TemplateSchema.parse(transformTemplate(raw)).description).toBe('Onboarding packet')
  })

  it('throws on a null id rather than inventing one', () => {
    const raw = { ...TEMPLATE_EXAMPLE, id: null } as unknown as RawDocSpringTemplate
    expect(() => transformTemplate(raw)).toThrow(/template id/)
  })
})

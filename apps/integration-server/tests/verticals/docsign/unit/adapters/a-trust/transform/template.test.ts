/**
 * A-Trust Signaturbox `GET /v2/templates` → canonical Template.
 *
 * The fixture is the documented example response, verbatim, from
 * https://docs.a-trust.at/apis/SignaturServer/templates ("List templates"):
 *
 *   { "templateList":[ {"id":"1", "description":"Default Template"},
 *     {"id":"2", "description":"Another Template"},
 *     {"id":"3", "description":"Next Template"} ] }
 *
 * and the spec's `TemplateSummary` (https://docs.a-trust.at/swagger/signaturbox.yaml)
 * has exactly two properties, `id: string` and `description: string`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformTemplate,
  type RawATrustTemplate,
} from '../../../../../../../src/verticals/docsign/adapters/a-trust/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'

const DOCUMENTED_EXAMPLE: { templateList: RawATrustTemplate[] } = {
  templateList: [
    { id: '1', description: 'Default Template' },
    { id: '2', description: 'Another Template' },
    { id: '3', description: 'Next Template' },
  ],
}

describe('A-Trust transformTemplate', () => {
  it('maps every documented TemplateSummary to a valid canonical Template', () => {
    const out = DOCUMENTED_EXAMPLE.templateList
      .map(transformTemplate)
      .map((t) => TemplateSchema.parse(t))
    expect(out.map((t) => t.id)).toEqual(['1', '2', '3'])
    expect(out.map((t) => t.externalId)).toEqual(['1', '2', '3'])
    expect(out.map((t) => t.name)).toEqual([
      'Default Template',
      'Another Template',
      'Next Template',
    ])
  })

  it('reads only the documented fields and invents nothing else', () => {
    const t = TemplateSchema.parse(transformTemplate({ id: '1', description: 'Default Template' }))
    expect(t).toEqual({
      id: '1',
      externalId: '1',
      name: 'Default Template',
      description: 'Default Template',
      signerRoles: [],
      documentCount: 0,
      platform: 'a-trust',
      metadata: {},
      raw: { id: '1', description: 'Default Template' },
    })
    expect(t.createdAt).toBeUndefined()
    expect(t.updatedAt).toBeUndefined()
  })

  it('does not read undocumented keys such as name or created_at', () => {
    const t = TemplateSchema.parse(
      transformTemplate({
        id: '9',
        description: 'Seal',
        name: 'not-documented',
        created_at: '2026-01-01T00:00:00Z',
        document_count: 4,
      } as RawATrustTemplate),
    )
    expect(t.name).toBe('Seal')
    expect(t.createdAt).toBeUndefined()
    expect(t.documentCount).toBe(0)
  })

  it('names a template without a description by its documented id', () => {
    const t = TemplateSchema.parse(transformTemplate({ id: '7' }))
    expect(t.name).toBe('7')
    expect(t.description).toBeUndefined()
  })

  it('throws on a summary with no id rather than inventing one', () => {
    expect(() => transformTemplate({ description: 'x' } as RawATrustTemplate)).toThrow(/id/)
  })

  it('throws on an empty-string id rather than emitting it as a canonical id', () => {
    expect(() => transformTemplate({ id: '', description: 'x' })).toThrow(/id/)
  })

  it('names a template with an empty-string description by its documented id', () => {
    const t = TemplateSchema.parse(transformTemplate({ id: '8', description: '' }))
    expect(t.name).toBe('8')
    expect(t.description).toBeUndefined()
  })
})

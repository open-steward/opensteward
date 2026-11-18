import { describe, it, expect } from 'vitest'
import { transformTemplate } from '../../../../../../../src/verticals/docsign/adapters/scrive/transform/template'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'
import { documentExample } from '../fixtures'

describe('scrive transformTemplate (a Document with is_template)', () => {
  it('maps title, roles and the counted files', () => {
    const doc = {
      ...documentExample(),
      is_template: true,
      status: 'preparation',
      sealed_file: null,
    }
    const out = TemplateSchema.parse(transformTemplate(doc))
    expect(out.id).toBe('8222115557375075439')
    expect(out.name).toBe('Contract for Magnus')
    expect(out.signerRoles).toEqual(['viewer', 'signing_party'])
    expect(out.documentCount).toBe(1)
    expect(out.createdAt).toBe('2017-01-13T10:38:17.916Z')
  })

  it('counts zero documents for a template without a file', () => {
    const out = TemplateSchema.parse(
      transformTemplate({
        id: '9',
        title: 'Empty',
        file: null,
        sealed_file: null,
        author_attachments: [],
      }),
    )
    expect(out.documentCount).toBe(0)
  })

  it('throws rather than inventing a name when title is missing', () => {
    expect(() => transformTemplate({ id: '9', file: null })).toThrow(/title/)
  })
})

import { describe, it, expect } from 'vitest'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'
import { transformTemplate } from '../../../../../../../src/verticals/docsign/adapters/universign/transform/template'
import type { RawUniversignTemplate } from '../../../../../../../src/verticals/docsign/adapters/universign/transform/types'
import { GET_TEMPLATE, LIST_TEMPLATE } from '../fixtures'

const tpl = (v: unknown) => v as RawUniversignTemplate

describe('universign transformTemplate (documented template object)', () => {
  it('maps the "Retrieve a template" example and survives TemplateSchema', () => {
    const out = TemplateSchema.parse(transformTemplate(tpl(GET_TEMPLATE)))
    expect(out.id).toBe('tpl_ky4Mygq1de3J')
    expect(out.name).toBe('New template')
    // The unknown participant $1720534563486 is designated "Employee".
    expect(out.signerRoles).toEqual(['Employee', 'jane.doe@example.com'])
    expect(out.documentCount).toBe(1)
    expect(out.createdAt).toBe('2024-07-09T14:15:18.644Z')
    expect(out.metadata).toMatchObject({ state: 'published', folderId: 'fol_JxmJlV5P922X' })
  })

  it('maps every "List templates" row', () => {
    const rows = LIST_TEMPLATE.content.map((r) => TemplateSchema.parse(transformTemplate(tpl(r))))
    expect(rows.map((r) => r.id)).toEqual(['tpl_Ylao6r8MEq7z', 'tpl_MyqwVqDwz6xd'])
    expect(rows[0]!.signerRoles).toEqual(['john.doe@signaturit.com'])
    expect(rows[1]!.signerRoles).toEqual(['john.doe@universign.com', 'jane.doe@uiversign.com'])
  })

  it('throws on a template with no template_name rather than inventing one', () => {
    expect(() => transformTemplate(tpl({ ...GET_TEMPLATE, template_name: undefined }))).toThrow(
      /template_name/,
    )
  })
})

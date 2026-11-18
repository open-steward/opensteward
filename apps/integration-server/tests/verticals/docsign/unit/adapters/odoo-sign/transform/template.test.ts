/** sign.template rows; field names from github.com/odoo/industry 18.0 / 19.0 data and views. */
import { describe, expect, it } from 'vitest'
import { TemplateSchema } from '../../../../../../../src/verticals/docsign/schema/template'
import { transformTemplate } from '../../../../../../../src/verticals/docsign/adapters/odoo-sign/transform/template'

const base = {
  id: 6,
  display_name: 'Display Rights Agreement',
  name: 'Display Rights Agreement',
  user_id: [2, 'Mitchell Admin'] as [number, string],
  tag_ids: [4, 1],
  create_date: '2026-01-15 09:30:00',
  write_date: '2026-02-01 14:20:00',
}

describe('odoo-sign transformTemplate', () => {
  it('maps a template with its roles and document count', () => {
    const t = TemplateSchema.parse(
      transformTemplate(base, { signerRoles: ['Museum', 'Artist'], documentCount: 1 }),
    )
    expect(t).toMatchObject({
      id: '6',
      externalId: '6',
      name: 'Display Rights Agreement',
      signerRoles: ['Museum', 'Artist'],
      documentCount: 1,
      createdAt: '2026-01-15T09:30:00.000Z',
      updatedAt: '2026-02-01T14:20:00.000Z',
      platform: 'odoo-sign',
    })
    expect(t.metadata).toEqual({ userId: '2', tagIds: '1,4' })
  })

  it('falls back to display_name when name is absent', () => {
    const { name: _n, ...noName } = base
    expect(
      TemplateSchema.parse(transformTemplate(noName, { signerRoles: [], documentCount: 0 })).name,
    ).toBe('Display Rights Agreement')
  })

  it('tolerates a row with only an id', () => {
    const t = TemplateSchema.parse(
      transformTemplate({ id: 2 }, { signerRoles: [], documentCount: 0 }),
    )
    expect(t).toMatchObject({ id: '2', name: '', signerRoles: [], documentCount: 0 })
    expect(t.metadata).toEqual({})
  })

  it('reads empty relations as absent', () => {
    const t = TemplateSchema.parse(
      transformTemplate(
        { ...base, user_id: false, tag_ids: false },
        { signerRoles: [], documentCount: 0 },
      ),
    )
    expect(t.metadata).toEqual({})
  })
})

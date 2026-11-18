/** project.tags rows; fields from addons/project/models/project_tags.py, 19.0. */
import { describe, expect, it } from 'vitest'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'
import { transformTag } from '../../../../../../../src/verticals/projects/adapters/odoo-project/transform/tag'

describe('odoo-project transformTag', () => {
  it('maps a tag, keeping the palette index out of the canonical color', () => {
    const t = TagSchema.parse(transformTag({ id: 5, name: 'Internal', color: 3 }))
    expect(t).toMatchObject({
      id: '5',
      externalId: '5',
      workspaceId: '',
      name: 'Internal',
      platform: 'odoo-project',
    })
    expect(t.color).toBeUndefined()
    expect(t.metadata).toEqual({ colorIndex: '3' })
  })

  it('tolerates an absent or empty color', () => {
    expect(TagSchema.parse(transformTag({ id: 6, name: 'x', color: false })).metadata).toEqual({})
    expect(TagSchema.parse(transformTag({ id: 7 })).name).toBe('')
  })
})

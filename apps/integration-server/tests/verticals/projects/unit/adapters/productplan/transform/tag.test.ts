/**
 * GET /api/v2/discovery/ideas/tags
 * (https://productplan.readme.io/reference/get_api-v2-discovery-ideas-tags.md)
 * documents its 200 body as
 * `{"type":"object","properties":{"tags":{"type":"array","items":{"type":"string"}}},"required":["tags"]}`:
 * each tag is a bare string, with no id, colour or count.
 */
import { describe, it, expect } from 'vitest'
import { transformTag } from '../../../../../../../src/verticals/projects/adapters/productplan/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('productplan transformTag', () => {
  it('maps a documented tag string to a canonical Tag', () => {
    const tag = TagSchema.parse(transformTag('mobile'))
    expect(tag).toEqual({
      id: 'mobile',
      externalId: 'mobile',
      workspaceId: '',
      name: 'mobile',
      platform: 'productplan',
      metadata: {},
      raw: 'mobile',
    })
  })

  it('keeps the string verbatim as the id and name', () => {
    const tag = TagSchema.parse(transformTag('Q3 launch / web'))
    expect(tag.id).toBe('Q3 launch / web')
    expect(tag.name).toBe('Q3 launch / web')
    expect(tag.color).toBeUndefined()
  })
})

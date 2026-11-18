import { describe, it, expect } from 'vitest'
import { transformTag } from '../../../../../../../src/verticals/projects/adapters/teamhood/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'
import { DOC_ITEM } from '../fixtures'

describe('teamhood transformTag (a label from Entities.Item.tags)', () => {
  it('parses with TagSchema; the label is the id within the workspace', () => {
    const tag = TagSchema.parse(transformTag({ name: DOC_ITEM.tags[0]! }, 'ws-1'))
    expect(tag).toMatchObject({
      id: 'Tag1',
      externalId: 'Tag1',
      name: 'Tag1',
      workspaceId: 'ws-1',
      platform: 'teamhood',
      metadata: {},
    })
    expect(tag.color).toBeUndefined()
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawFavroTag,
} from '../../../../../../../src/verticals/projects/adapters/favro/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('favro transformTag', () => {
  const raw: RawFavroTag = {
    tagId: 'tag-favro-1',
    organizationId: 'org-xyz',
    name: 'High Priority',
    color: 'red',
  }

  it('maps id and externalId from tagId', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('tag-favro-1')
    expect(result.externalId).toBe('tag-favro-1')
  })

  it('maps workspaceId from organizationId', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('org-xyz')
  })

  it('maps name', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('High Priority')
  })

  it('maps color', () => {
    const result = transformTag(raw)
    expect(result.color).toBe('red')
  })

  it('color is undefined when absent', () => {
    const result = transformTag({ tagId: 'tag-2', name: 'Misc' })
    expect(result.color).toBeUndefined()
  })

  it('workspaceId is empty string when organizationId is absent', () => {
    const result = transformTag({ tagId: 'tag-3', name: 'X' })
    expect(result.workspaceId).toBe('')
  })

  it('platform is favro', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('favro')
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawZohoSprintsTag,
} from '../../../../../../../src/verticals/projects/adapters/zoho-sprints/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('zoho-sprints transformTag', () => {
  const raw: RawZohoSprintsTag = {
    tagId: 'tag-88',
    name: 'backend',
    color: '#ff5733',
    teamId: 'team-9',
  }

  it('maps id and externalId from tagId', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('tag-88')
    expect(result.externalId).toBe('tag-88')
  })

  it('maps name', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('backend')
  })

  it('maps workspaceId from teamId', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('team-9')
  })

  it('maps color', () => {
    const result = transformTag(raw)
    expect(result.color).toBe('#ff5733')
  })

  it('color is undefined when not present', () => {
    const result = transformTag({ ...raw, color: undefined })
    expect(result.color).toBeUndefined()
  })

  it('platform is zoho-sprints', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('zoho-sprints')
  })

  it('metadata is an empty object', () => {
    const result = transformTag(raw)
    expect(result.metadata).toEqual({})
  })

  it('workspaceId is empty string when teamId is absent', () => {
    const result = transformTag({ tagId: 'tag-x', name: 'bug' })
    expect(result.workspaceId).toBe('')
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawProjectManagerTag,
} from '../../../../../../../src/verticals/projects/adapters/projectmanager/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('projectmanager transformTag', () => {
  const raw: RawProjectManagerTag = {
    id: 'tag-uuid-5',
    name: 'urgent',
    color: '#ff0000',
  }

  it('maps id and externalId correctly', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('tag-uuid-5')
    expect(result.externalId).toBe('tag-uuid-5')
  })

  it('maps name correctly', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('urgent')
  })

  it('maps color correctly', () => {
    const result = transformTag(raw)
    expect(result.color).toBe('#ff0000')
  })

  it('workspaceId comes from argument', () => {
    const result = transformTag(raw, 'ws-pm-1')
    expect(result.workspaceId).toBe('ws-pm-1')
  })

  it('workspaceId defaults to empty string', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('')
  })

  it('platform is projectmanager', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('projectmanager')
  })

  it('color is undefined when null', () => {
    const result = transformTag({ id: 'tag-2', name: 'no-color', color: null })
    expect(result.color).toBeUndefined()
  })

  it('name is empty string when name is null', () => {
    const result = transformTag({ id: 'tag-3', name: null })
    expect(result.name).toBe('')
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw, 'ws-1')
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})

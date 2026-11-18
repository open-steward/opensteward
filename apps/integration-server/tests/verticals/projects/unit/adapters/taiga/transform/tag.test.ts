import { describe, it, expect } from 'vitest'
import {
  transformTag,
  expandTagsColors,
  type RawTaigaTag,
} from '../../../../../../../src/verticals/projects/adapters/taiga/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('taiga transformTag', () => {
  const raw: RawTaigaTag = {
    name: 'frontend',
    color: '#ff0000',
    projectId: '88',
  }

  it('maps id as composite projectId:name', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('88:frontend')
    expect(result.externalId).toBe('88:frontend')
  })

  it('maps workspaceId from projectId', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('88')
  })

  it('maps name', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('frontend')
  })

  it('maps color when present', () => {
    const result = transformTag(raw)
    expect(result.color).toBe('#ff0000')
  })

  it('color is undefined when color is null', () => {
    const result = transformTag({ ...raw, color: null })
    expect(result.color).toBeUndefined()
  })

  it('platform is taiga', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('taiga')
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})

describe('taiga expandTagsColors', () => {
  it('expands a tags_colors map into RawTaigaTag records', () => {
    const tagsColors = { frontend: '#ff0000', backend: null }
    const result = expandTagsColors(tagsColors, '88')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ name: 'frontend', color: '#ff0000', projectId: '88' })
    expect(result[1]).toEqual({ name: 'backend', color: undefined, projectId: '88' })
  })

  it('returns empty array for empty map', () => {
    const result = expandTagsColors({}, '88')
    expect(result).toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawBusinessmapTag,
} from '../../../../../../../src/verticals/projects/adapters/businessmap/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('businessmap transformTag', () => {
  const raw: RawBusinessmapTag = {
    tag_id: 9,
    label: 'Blocker',
    color: '#ff0000',
  }

  it('maps id and externalId from tag_id', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('9')
    expect(result.externalId).toBe('9')
  })

  it('maps name from label', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('Blocker')
  })

  it('maps color', () => {
    const result = transformTag(raw)
    expect(result.color).toBe('#ff0000')
  })

  it('uses caller-supplied workspaceId', () => {
    const result = transformTag(raw, 'ws-99')
    expect(result.workspaceId).toBe('ws-99')
  })

  it('workspaceId defaults to empty string when not supplied', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('')
  })

  it('platform is businessmap', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('businessmap')
  })

  it('color is undefined when absent', () => {
    const result = transformTag({ tag_id: 1, label: 'Misc' })
    expect(result.color).toBeUndefined()
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw, 'ws-1')
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})

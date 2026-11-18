import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawWorkboardTag,
} from '../../../../../../../src/verticals/projects/adapters/workboard/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('workboard transformTag', () => {
  const raw: RawWorkboardTag = {
    tag_id: 15,
    name: 'critical',
    color: '#ff0000',
  }

  it('maps id and externalId from tag_id', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('15')
    expect(result.externalId).toBe('15')
  })

  it('falls back id to raw.id when tag_id absent', () => {
    const result = transformTag({ id: 42, name: 'fallback' })
    expect(result.id).toBe('42')
  })

  it('maps name', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('critical')
  })

  it('maps color', () => {
    const result = transformTag(raw)
    expect(result.color).toBe('#ff0000')
  })

  it('workspaceId is always empty string', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('')
  })

  it('platform is workboard', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('workboard')
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})

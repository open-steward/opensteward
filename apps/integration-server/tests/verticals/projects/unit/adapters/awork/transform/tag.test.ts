import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawAworkProjectTag,
} from '../../../../../../../src/verticals/projects/adapters/awork/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('awork transformTag', () => {
  const raw: RawAworkProjectTag = {
    name: 'High Priority',
    color: '#FF5733',
    usageCount: 12,
  }

  it('synthesises id from lowercased, space-replaced name', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('high_priority')
  })

  it('externalId equals id', () => {
    const result = transformTag(raw)
    expect(result.externalId).toBe(result.id)
  })

  it('workspaceId is empty string', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('')
  })

  it('maps name', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('High Priority')
  })

  it('maps color', () => {
    const result = transformTag(raw)
    expect(result.color).toBe('#FF5733')
  })

  it('platform is awork', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('awork')
  })

  it('metadata.usageCount reflects usageCount', () => {
    const result = transformTag(raw)
    expect(result.metadata.usageCount).toBe('12')
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })

  it('strips special characters from id', () => {
    const result = transformTag({ name: 'C++ Feature!', color: null })
    // After lower + replace spaces → underscores + strip non-alnum
    expect(result.id).toBe('c_feature')
  })

  it('color is undefined when absent', () => {
    const result = transformTag({ name: 'plain', color: null })
    expect(result.color).toBeUndefined()
  })

  it('name and id fall back to empty string when name is absent', () => {
    const result = transformTag({})
    expect(result.name).toBe('')
    // tagId('') → '' so id falls back to name (also '')
    expect(result.id).toBe('')
  })
})

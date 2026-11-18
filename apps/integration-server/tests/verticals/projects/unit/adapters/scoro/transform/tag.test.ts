import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawScoroTag,
} from '../../../../../../../src/verticals/projects/adapters/scoro/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('scoro transformTag', () => {
  const raw: RawScoroTag = {
    id: 55,
    name: 'frontend',
    color: '#4f46e5',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('55')
    expect(result.externalId).toBe('55')
  })

  it('maps name from raw.name', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('frontend')
  })

  it('maps color from raw.color', () => {
    const result = transformTag(raw)
    expect(result.color).toBe('#4f46e5')
  })

  it('workspaceId is always empty string', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('')
  })

  it('color is undefined when not provided', () => {
    const result = transformTag({ id: 55, name: 'backend' })
    expect(result.color).toBeUndefined()
  })

  it('platform is scoro', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('scoro')
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})

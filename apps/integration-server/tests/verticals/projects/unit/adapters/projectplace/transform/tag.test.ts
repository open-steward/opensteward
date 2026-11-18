import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawProjectplaceTag,
} from '../../../../../../../src/verticals/projects/adapters/projectplace/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('projectplace transformTag', () => {
  const raw: RawProjectplaceTag = {
    id: 33,
    name: 'backend',
    color: 4,
    count: 7,
  }

  it('maps id as string', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('33')
    expect(result.externalId).toBe('33')
  })

  it('maps name correctly', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('backend')
  })

  it('converts numeric color to string', () => {
    const result = transformTag(raw)
    expect(result.color).toBe('4')
  })

  it('handles string color directly', () => {
    const result = transformTag({ ...raw, color: '#aabbcc' })
    expect(result.color).toBe('#aabbcc')
  })

  it('color is undefined when absent', () => {
    const result = transformTag({ id: 1, name: 'no-color' })
    expect(result.color).toBeUndefined()
  })

  it('workspaceId comes from argument', () => {
    const result = transformTag(raw, 'proj-77')
    expect(result.workspaceId).toBe('proj-77')
  })

  it('workspaceId defaults to empty string', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('')
  })

  it('platform is projectplace', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('projectplace')
  })

  it('metadata includes count', () => {
    const result = transformTag(raw)
    expect(result.metadata.count).toBe('7')
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw, 'proj-1')
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})

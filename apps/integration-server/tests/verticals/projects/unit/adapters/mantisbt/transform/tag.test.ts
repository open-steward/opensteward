import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawMantisbtTag,
} from '../../../../../../../src/verticals/projects/adapters/mantisbt/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('mantisbt transformTag', () => {
  const raw: RawMantisbtTag = {
    id: 42,
    name: 'regression',
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps name from raw.name', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('regression')
  })

  it('workspaceId is the fixed placeholder "default"', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('default')
  })

  it('color is undefined (MantisBT tags have no color)', () => {
    const result = transformTag(raw)
    expect(result.color).toBeUndefined()
  })

  it('platform is mantisbt', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('mantisbt')
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })

  it('handles missing id and name gracefully', () => {
    const result = transformTag({})
    expect(result.id).toBe('')
    expect(result.name).toBe('')
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawWeekdoneTag,
} from '../../../../../../../src/verticals/projects/adapters/weekdone/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('weekdone transformTag', () => {
  const raw: RawWeekdoneTag = {
    id: 7,
    tag: 'Blocked',
    color: '#e53e3e',
    team_id: 9,
  }

  it('id is stringified tag id', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('7')
  })

  it('externalId equals id', () => {
    const result = transformTag(raw)
    expect(result.externalId).toBe('7')
  })

  it('workspaceId is derived from team_id', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('9')
  })

  it('workspaceId is empty string when team_id is absent', () => {
    const result = transformTag({ id: 1 })
    expect(result.workspaceId).toBe('')
  })

  it('name maps from the tag field (not name)', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('Blocked')
  })

  it('name is empty string when tag field is absent', () => {
    const result = transformTag({ id: 1 })
    expect(result.name).toBe('')
  })

  it('color is preserved', () => {
    const result = transformTag(raw)
    expect(result.color).toBe('#e53e3e')
  })

  it('color is undefined when absent', () => {
    const result = transformTag({ id: 1 })
    expect(result.color).toBeUndefined()
  })

  it('platform is weekdone', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('weekdone')
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })

  it('passes TagSchema.parse with minimal input', () => {
    const result = transformTag({ id: 1 })
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})

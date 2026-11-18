import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawKanboardTag,
} from '../../../../../../../src/verticals/projects/adapters/kanboard/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('kanboard transformTag', () => {
  const raw: RawKanboardTag = {
    id: '300',
    name: 'frontend',
    project_id: '12',
    color_id: 'green',
  }

  it('maps id as string', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('300')
    expect(result.externalId).toBe('300')
  })

  it('maps name', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('frontend')
  })

  it('maps workspaceId from project_id', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('12')
  })

  it('workspaceId is empty string when project_id absent', () => {
    const result = transformTag({ id: '1' })
    expect(result.workspaceId).toBe('')
  })

  it('maps color from color_id', () => {
    const result = transformTag(raw)
    expect(result.color).toBe('green')
  })

  it('platform is kanboard', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('kanboard')
  })

  it('metadata contains projectId', () => {
    const result = transformTag(raw)
    expect(result.metadata.projectId).toBe('12')
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})

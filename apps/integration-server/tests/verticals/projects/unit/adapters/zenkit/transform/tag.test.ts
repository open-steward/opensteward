import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawAirtableTag,
} from '../../../../../../../src/verticals/projects/adapters/zenkit/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('zenkit transformTag', () => {
  const raw: RawAirtableTag = {
    gid: 'tag-gid-1',
    name: 'Design',
    color: 'light-blue',
    workspace: { gid: 'ws-gid-1' },
  }

  it('maps id and externalId from gid', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('tag-gid-1')
    expect(result.externalId).toBe('tag-gid-1')
  })

  it('maps name', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('Design')
  })

  it('name is empty string when absent', () => {
    const result = transformTag({ ...raw, name: undefined })
    expect(result.name).toBe('')
  })

  it('maps color', () => {
    const result = transformTag(raw)
    expect(result.color).toBe('light-blue')
  })

  it('color is undefined when absent', () => {
    const result = transformTag({ ...raw, color: undefined })
    expect(result.color).toBeUndefined()
  })

  it('maps workspaceId from workspace.gid', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('ws-gid-1')
  })

  it('workspaceId is empty string when workspace absent', () => {
    const result = transformTag({ ...raw, workspace: undefined })
    expect(result.workspaceId).toBe('')
  })

  it('platform is zenkit', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('zenkit')
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})

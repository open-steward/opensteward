import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawLinearTag,
} from '../../../../../../../src/verticals/projects/adapters/wimi/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('wimi transformTag', () => {
  const raw: RawLinearTag = {
    gid: 'tag-7',
    name: 'backend',
    color: '#0d6efd',
    workspace: { gid: 'ws-10' },
  }

  it('maps id and externalId from gid', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('tag-7')
    expect(result.externalId).toBe('tag-7')
  })

  it('maps name', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('backend')
  })

  it('maps workspaceId from workspace.gid', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('ws-10')
  })

  it('maps color', () => {
    const result = transformTag(raw)
    expect(result.color).toBe('#0d6efd')
  })

  it('platform is wimi', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('wimi')
  })

  it('workspaceId defaults to empty string when workspace absent', () => {
    const result = transformTag({ ...raw, workspace: undefined })
    expect(result.workspaceId).toBe('')
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})

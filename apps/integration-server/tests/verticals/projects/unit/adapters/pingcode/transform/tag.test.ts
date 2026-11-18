import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawPingcodeTag,
} from '../../../../../../../src/verticals/projects/adapters/pingcode/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('transformTag', () => {
  it('maps all fields including color and enterpriseId as workspaceId', () => {
    const raw: RawPingcodeTag = {
      id: 'tag_001',
      name: 'bug',
      color: '#56ABFB',
    }

    const result = transformTag(raw, 'ent_acme')

    expect(result.id).toBe('tag_001')
    expect(result.externalId).toBe('tag_001')
    expect(result.name).toBe('bug')
    expect(result.color).toBe('#56ABFB')
    expect(result.workspaceId).toBe('ent_acme')
    expect(result.platform).toBe('pingcode')
    expect(result.metadata).toEqual({})
    expect(() => TagSchema.parse(result)).not.toThrow()
  })

  it('defaults workspaceId to empty string when enterpriseId is not provided', () => {
    const raw: RawPingcodeTag = {
      id: 'tag_002',
      name: 'feature',
    }

    const result = transformTag(raw)

    expect(result.workspaceId).toBe('')
    expect(result.color).toBeUndefined()
    expect(() => TagSchema.parse(result)).not.toThrow()
  })

  it('handles missing name by defaulting to empty string', () => {
    const raw: RawPingcodeTag = {
      id: 'tag_003',
    }

    const result = transformTag(raw, 'ent_xyz')

    expect(result.name).toBe('')
    expect(result.workspaceId).toBe('ent_xyz')
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})

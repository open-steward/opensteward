import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawFactroTag,
} from '../../../../../../../src/verticals/projects/adapters/factro/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('factro transformTag', () => {
  const raw: RawFactroTag = {
    id: 'tag-1',
    name: 'Critical',
    changeDate: '2024-02-10T09:00:00.000Z',
    mandantId: 'mandant-1',
  }

  it('maps id and externalId', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('tag-1')
    expect(result.externalId).toBe('tag-1')
  })

  it('maps name', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('Critical')
  })

  it('workspaceId uses caller-supplied workspaceId', () => {
    const result = transformTag(raw, 'ws-override')
    expect(result.workspaceId).toBe('ws-override')
  })

  it('workspaceId falls back to mandantId when no arg supplied', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('mandant-1')
  })

  it('color is always undefined (Factro tags have no color field)', () => {
    const result = transformTag(raw)
    expect(result.color).toBeUndefined()
  })

  it('platform is factro', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('factro')
  })

  it('metadata.updatedAt reflects changeDate as ISO string', () => {
    const result = transformTag(raw)
    expect(result.metadata.updatedAt).toBe('2024-02-10T09:00:00.000Z')
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})

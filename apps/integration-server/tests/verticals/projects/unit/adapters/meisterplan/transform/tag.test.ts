import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawMeisterplanRole,
} from '../../../../../../../src/verticals/projects/adapters/meisterplan/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('meisterplan transformTag (role)', () => {
  const raw: RawMeisterplanRole = {
    id: 'role-123',
    name: 'Frontend Developer',
    externalId: 'ext-role-99',
  }

  it('maps id directly', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('role-123')
  })

  it('maps externalId from raw.externalId when present', () => {
    const result = transformTag(raw)
    expect(result.externalId).toBe('ext-role-99')
  })

  it('falls back externalId to raw.id when externalId is absent', () => {
    const result = transformTag({ id: 'role-456', externalId: null })
    expect(result.externalId).toBe('role-456')
  })

  it('maps name from raw.name', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('Frontend Developer')
  })

  it('falls back name to id when name is absent', () => {
    const result = transformTag({ id: 'role-789', name: null })
    expect(result.name).toBe('role-789')
  })

  it('workspaceId is the caller-supplied value', () => {
    const result = transformTag(raw, 'scenario-1')
    expect(result.workspaceId).toBe('scenario-1')
  })

  it('workspaceId is empty string when not supplied', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('')
  })

  it('color is always undefined (roles have no color)', () => {
    const result = transformTag(raw)
    expect(result.color).toBeUndefined()
  })

  it('platform is meisterplan', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('meisterplan')
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw, 'scenario-1')
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})

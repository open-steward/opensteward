import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawFieldwireEntityTag,
} from '../../../../../../../src/verticals/projects/adapters/fieldwire/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('fieldwire transformTag', () => {
  const raw: RawFieldwireEntityTag = {
    id: 'tag-uuid-001',
    name: 'Electrical',
    color: '#3b82f6',
    project_id: 'proj-uuid-001',
    created_at: '2026-02-01T09:00:00Z',
    updated_at: '2026-02-10T11:00:00Z',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('tag-uuid-001')
    expect(result.externalId).toBe('tag-uuid-001')
  })

  it('maps name correctly', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('Electrical')
  })

  it('maps color correctly', () => {
    const result = transformTag(raw)
    expect(result.color).toBe('#3b82f6')
  })

  it('workspaceId uses projectId param when provided', () => {
    const result = transformTag(raw, 'override-proj-id')
    expect(result.workspaceId).toBe('override-proj-id')
  })

  it('workspaceId falls back to raw.project_id when no projectId param', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('proj-uuid-001')
  })

  it('workspaceId is empty string when both projectId param and raw.project_id are absent', () => {
    const result = transformTag({ id: 'tag-no-proj' })
    expect(result.workspaceId).toBe('')
  })

  it('platform is fieldwire', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('fieldwire')
  })

  it('color is undefined when raw.color is null', () => {
    const result = transformTag({ ...raw, color: null })
    expect(result.color).toBeUndefined()
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})

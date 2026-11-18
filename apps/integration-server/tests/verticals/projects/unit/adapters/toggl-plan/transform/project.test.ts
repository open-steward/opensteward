import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawTogglPlanProject,
} from '../../../../../../../src/verticals/projects/adapters/toggl-plan/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('toggl-plan transformProject', () => {
  const raw: RawTogglPlanProject = {
    id: 5001,
    name: 'Website Redesign',
    color: '#FF6600',
    color_id: 3,
    archived: false,
    tags: [10, 20],
    created_at: '2024-01-15T09:00:00.000Z',
    updated_at: '2024-02-20T11:00:00.000Z',
  }

  it('maps id and externalId from raw.id as string', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('5001')
    expect(result.externalId).toBe('5001')
  })

  it('maps name correctly', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Website Redesign')
  })

  it('status is active when archived is false', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived when archived is true', () => {
    const result = transformProject({ ...raw, archived: true })
    expect(result.status).toBe('archived')
  })

  it('workspaceId uses caller-supplied arg', () => {
    const result = transformProject(raw, 'ws-123')
    expect(result.workspaceId).toBe('ws-123')
  })

  it('workspaceId is empty string when no arg', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('')
  })

  it('createdAt is ISO string from created_at (snake_case)', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe(new Date('2024-01-15T09:00:00.000Z').toISOString())
  })

  it('platform is toggl-plan', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('toggl-plan')
  })

  it('metadata stores color', () => {
    const result = transformProject(raw)
    expect(result.metadata['color']).toBe('#FF6600')
  })

  it('metadata stores tag ids as comma-separated string', () => {
    const result = transformProject(raw)
    expect(result.metadata['tagIds']).toBe('10,20')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

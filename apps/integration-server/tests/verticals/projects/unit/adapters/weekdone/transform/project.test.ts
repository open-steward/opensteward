import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawWeekdoneObjective,
} from '../../../../../../../src/verticals/projects/adapters/weekdone/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('weekdone transformProject', () => {
  const raw: RawWeekdoneObjective = {
    id: 101,
    description: 'Increase retention by 20%',
    type: 'company',
    progress: 50,
    team_id: 9,
    user_id: 3,
    due_on: '2026-03-31T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-02-01T12:00:00.000Z',
  }

  it('id is stringified objective id', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('101')
  })

  it('externalId equals id', () => {
    const result = transformProject(raw)
    expect(result.externalId).toBe('101')
  })

  it('workspaceId is derived from team_id', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('9')
  })

  it('workspaceId is empty string when team_id is absent', () => {
    const result = transformProject({ id: 1 })
    expect(result.workspaceId).toBe('')
  })

  it('name maps from description field', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Increase retention by 20%')
  })

  it('name is empty string when description is absent', () => {
    const result = transformProject({ id: 1 })
    expect(result.name).toBe('')
  })

  it('status is active when progress is between 0 and 99', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is completed when progress is 100', () => {
    const result = transformProject({ ...raw, progress: 100 })
    expect(result.status).toBe('completed')
  })

  it('status is active when progress is 0', () => {
    const result = transformProject({ ...raw, progress: 0 })
    expect(result.status).toBe('active')
  })

  it('ownerId is derived from user_id', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('3')
  })

  it('ownerId is undefined when user_id is absent', () => {
    const result = transformProject({ id: 1 })
    expect(result.ownerId).toBeUndefined()
  })

  it('endDate is converted to ISO from due_on', () => {
    const result = transformProject(raw)
    expect(result.endDate).toBe(new Date('2026-03-31T00:00:00.000Z').toISOString())
  })

  it('createdAt is converted to ISO from created_at', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe(new Date('2026-01-01T00:00:00.000Z').toISOString())
  })

  it('updatedAt is converted to ISO from updated_at', () => {
    const result = transformProject(raw)
    expect(result.updatedAt).toBe(new Date('2026-02-01T12:00:00.000Z').toISOString())
  })

  it('platform is weekdone', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('weekdone')
  })

  it('metadata includes objectiveType and progress', () => {
    const result = transformProject(raw)
    expect(result.metadata.objectiveType).toBe('company')
    expect(result.metadata.progress).toBe('50')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it('passes ProjectSchema.parse with minimal input', () => {
    const result = transformProject({ id: 1 })
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

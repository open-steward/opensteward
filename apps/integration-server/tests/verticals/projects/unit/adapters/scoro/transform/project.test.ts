import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawScoroProject,
} from '../../../../../../../src/verticals/projects/adapters/scoro/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('scoro transformProject', () => {
  const raw: RawScoroProject = {
    project_id: 101,
    project_name: 'Website Redesign',
    description: 'Redesign the marketing website.',
    status: 'task_status1',
    manager_id: 7,
    project_start_date: '2026-01-15',
    project_end_date: '2026-06-30',
    created_date: '2026-01-10T09:00:00Z',
    modified_date: '2026-03-20T11:30:00Z',
    company_id: 5,
    project_type: 'regular',
    is_deleted: false,
  }

  it('maps id and externalId from project_id', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
  })

  it('maps name from project_name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Website Redesign')
  })

  it('maps workspaceId from company_id', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('5')
  })

  it('maps ownerId from manager_id', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('7')
  })

  it('maps description field', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Redesign the marketing website.')
  })

  it('status is active for opaque status slug', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is completed when status includes "done"', () => {
    const result = transformProject({ ...raw, status: 'done' })
    expect(result.status).toBe('completed')
  })

  it('status is completed when status includes "completed"', () => {
    const result = transformProject({ ...raw, status: 'project_completed' })
    expect(result.status).toBe('completed')
  })

  it('status is on_hold when status includes "hold"', () => {
    const result = transformProject({ ...raw, status: 'on_hold' })
    expect(result.status).toBe('on_hold')
  })

  it('status is archived when is_deleted is true', () => {
    const result = transformProject({ ...raw, is_deleted: true })
    expect(result.status).toBe('archived')
  })

  it('status is archived when is_deleted is 1', () => {
    const result = transformProject({ ...raw, is_deleted: 1 })
    expect(result.status).toBe('archived')
  })

  it('maps startDate from project_start_date', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBe('2026-01-15T00:00:00.000Z')
  })

  it('maps endDate from project_end_date', () => {
    const result = transformProject(raw)
    expect(result.endDate).toBe('2026-06-30T00:00:00.000Z')
  })

  it('maps createdAt from created_date', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2026-01-10T09:00:00.000Z')
  })

  it('maps updatedAt from modified_date', () => {
    const result = transformProject(raw)
    expect(result.updatedAt).toBe('2026-03-20T11:30:00.000Z')
  })

  it('stores projectType and status in metadata', () => {
    const result = transformProject(raw)
    expect(result.metadata.projectType).toBe('regular')
    expect(result.metadata.status).toBe('task_status1')
  })

  it('platform is scoro', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('scoro')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

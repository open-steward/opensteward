import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawFloatProject,
} from '../../../../../../../src/verticals/projects/adapters/float/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('float transformProject', () => {
  const raw: RawFloatProject = {
    project_id: 99,
    name: 'Acme Rebrand',
    project_code: 'ACM-01',
    client_id: 42,
    color: '#FF5733',
    notes: 'Full visual rebrand for Acme Industries.',
    tags: [{ name: 'design' }, { name: 'priority' }],
    status: 1,
    non_billable: 0,
    tentative: 0,
    active: 1,
    project_manager: 7,
    budget_type: 2,
    start_date: '2026-03-01',
    end_date: '2026-06-30',
    created: '2026-01-10 12:00:00',
    modified: '2026-04-05 09:30:00',
  }

  it('maps project_id to id and externalId as string', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('99')
    expect(result.externalId).toBe('99')
  })

  it('maps client_id to workspaceId as string', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('42')
  })

  it('maps name from raw.name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Acme Rebrand')
  })

  it('maps notes to description', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Full visual rebrand for Acme Industries.')
  })

  it('status is active when active=1', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived when active=0', () => {
    const result = transformProject({ ...raw, active: 0 })
    expect(result.status).toBe('archived')
  })

  it('status is archived when active=false', () => {
    const result = transformProject({ ...raw, active: false })
    expect(result.status).toBe('archived')
  })

  it('maps project_manager to ownerId as string', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('7')
  })

  it('ownerId is undefined when project_manager is absent', () => {
    const result = transformProject({ ...raw, project_manager: null })
    expect(result.ownerId).toBeUndefined()
  })

  it('maps start_date to a startDate ISO string starting with 2026-03-01', () => {
    const result = transformProject(raw)
    expect(result.startDate).toMatch(/^2026-03-01/)
  })

  it('maps end_date to an endDate ISO string starting with 2026-06-30', () => {
    const result = transformProject(raw)
    expect(result.endDate).toMatch(/^2026-06-30/)
  })

  it('maps created (space-separated) to a defined createdAt ISO string', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBeDefined()
    expect(result.createdAt).toMatch(/^2026-01-10T/)
  })

  it('maps modified (space-separated) to a defined updatedAt ISO string', () => {
    const result = transformProject(raw)
    expect(result.updatedAt).toBeDefined()
    expect(result.updatedAt).toMatch(/^2026-04-05T/)
  })

  it('platform is float', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('float')
  })

  it('metadata contains color and projectCode', () => {
    const result = transformProject(raw)
    expect(result.metadata.color).toBe('#FF5733')
    expect(result.metadata.projectCode).toBe('ACM-01')
  })

  it('metadata.tags joins tag names', () => {
    const result = transformProject(raw)
    expect(result.metadata.tags).toBe('design,priority')
  })

  it('workspaceId is empty string when client_id is absent', () => {
    const result = transformProject({ ...raw, client_id: null })
    expect(result.workspaceId).toBe('')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it('handles minimal raw object gracefully', () => {
    const result = transformProject({ project_id: 1 })
    expect(result.id).toBe('1')
    expect(result.name).toBe('')
    expect(result.workspaceId).toBe('')
    expect(result.status).toBe('active')
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

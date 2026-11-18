import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawPlaneProject,
} from '../../../../../../../src/verticals/projects/adapters/plane/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('plane transformProject', () => {
  const raw: RawPlaneProject = {
    id: 'proj-uuid-001',
    name: 'Acme Backend',
    description: 'Core backend services for Acme.',
    identifier: 'ACME',
    network: 2,
    project_lead: 'user-uuid-lead',
    workspace: 'workspace-uuid-001',
    archived_at: null,
    start_date: '2024-01-15T12:00:00.000Z',
    target_date: '2024-06-30T00:00:00.000Z',
    created_at: '2024-01-10T09:00:00.000Z',
    updated_at: '2024-01-20T14:00:00.000Z',
    created_by: 'user-uuid-creator',
  }

  it('id and externalId map from raw.id', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('proj-uuid-001')
    expect(result.externalId).toBe('proj-uuid-001')
  })

  it('name maps from raw.name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Acme Backend')
  })

  it('description maps from raw.description', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Core backend services for Acme.')
  })

  it('workspaceId comes from raw.workspace when no arg given', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('workspace-uuid-001')
  })

  it('caller-supplied workspaceId overrides raw.workspace', () => {
    const result = transformProject(raw, 'override-workspace-id')
    expect(result.workspaceId).toBe('override-workspace-id')
  })

  it('workspaceId is empty string when arg and raw.workspace are absent', () => {
    const result = transformProject({ ...raw, workspace: undefined })
    expect(result.workspaceId).toBe('')
  })

  it('status is active when archived_at is null', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived when archived_at is present', () => {
    const result = transformProject({ ...raw, archived_at: '2024-03-01T00:00:00.000Z' })
    expect(result.status).toBe('archived')
  })

  it('ownerId maps from project_lead', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('user-uuid-lead')
  })

  it('ownerId is undefined when project_lead is absent', () => {
    const result = transformProject({ ...raw, project_lead: null })
    expect(result.ownerId).toBeUndefined()
  })

  it('endDate maps from target_date', () => {
    const result = transformProject(raw)
    expect(result.endDate).toBe('2024-06-30T00:00:00.000Z')
  })

  it('startDate maps from start_date', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBe('2024-01-15T12:00:00.000Z')
  })

  it('metadata contains identifier', () => {
    const result = transformProject(raw)
    expect(result.metadata['identifier']).toBe('ACME')
  })

  it('metadata contains network as string', () => {
    const result = transformProject(raw)
    expect(result.metadata['network']).toBe('2')
  })

  it('platform is plane', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('plane')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it('passes ProjectSchema.parse for archived project', () => {
    const result = transformProject({ ...raw, archived_at: '2024-03-01T00:00:00.000Z' })
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

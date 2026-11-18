import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawAworkProject,
} from '../../../../../../../src/verticals/projects/adapters/awork/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('awork transformProject', () => {
  const raw: RawAworkProject = {
    id: 'proj-awork-1',
    name: 'Website Redesign',
    description: 'Redesign the marketing site.',
    isPrivate: false,
    startDate: '2024-05-01T00:00:00Z',
    dueDate: '2024-07-31T00:00:00Z',
    companyId: 'company-5',
    projectStatusId: 'status-1',
    projectStatus: { id: 'status-1', name: 'Active', type: 'active', order: 1 },
    projectKey: 'WR',
    createdOn: '2024-04-15T08:00:00Z',
    createdBy: 'usr-3',
    updatedOn: '2024-05-01T08:00:00Z',
    closedOn: null,
  }

  it('maps id and externalId', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('proj-awork-1')
    expect(result.externalId).toBe('proj-awork-1')
  })

  it('maps workspaceId from companyId', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('company-5')
  })

  it('maps name and description', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Website Redesign')
    expect(result.description).toBe('Redesign the marketing site.')
  })

  it('status is active for projectStatus.type=active', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is active for projectStatus.type=progress', () => {
    const result = transformProject({ ...raw, projectStatus: { type: 'progress' } })
    expect(result.status).toBe('active')
  })

  it('status is on_hold for projectStatus.type=planned', () => {
    const result = transformProject({ ...raw, projectStatus: { type: 'planned' } })
    expect(result.status).toBe('on_hold')
  })

  it('status is archived for projectStatus.type=closed', () => {
    const result = transformProject({ ...raw, projectStatus: { type: 'closed' } })
    expect(result.status).toBe('archived')
  })

  it('status is archived when closedOn is set (takes priority)', () => {
    const result = transformProject({ ...raw, closedOn: '2024-06-01T00:00:00Z' })
    expect(result.status).toBe('archived')
  })

  it('maps ownerId from createdBy', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('usr-3')
  })

  it('startDate maps from startDate field', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBe('2024-05-01T00:00:00.000Z')
  })

  it('endDate maps from dueDate field', () => {
    const result = transformProject(raw)
    expect(result.endDate).toBe('2024-07-31T00:00:00.000Z')
  })

  it('createdAt maps from createdOn', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2024-04-15T08:00:00.000Z')
  })

  it('platform is awork', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('awork')
  })

  it('metadata.projectKey is set', () => {
    const result = transformProject(raw)
    expect(result.metadata.projectKey).toBe('WR')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it('workspaceId is empty string when companyId is absent', () => {
    const result = transformProject({ id: 'p1', name: 'Test', companyId: null })
    expect(result.workspaceId).toBe('')
  })
})

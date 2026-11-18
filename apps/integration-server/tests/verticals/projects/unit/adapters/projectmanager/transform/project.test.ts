import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawProjectManagerProject,
} from '../../../../../../../src/verticals/projects/adapters/projectmanager/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('projectmanager transformProject', () => {
  const raw: RawProjectManagerProject = {
    id: 'proj-uuid-1',
    name: 'Platform Rewrite',
    description: 'Full rewrite of the core platform.',
    shortCode: 'PRW',
    shortId: 'prw-001',
    status: { id: 'status-1', name: 'Active' },
    manager: { id: 'mgr-uuid', name: 'Dave Manager', email: 'dave@example.com' },
    startDate: '2025-01-01T00:00:00.000Z',
    endDate: '2025-12-31T23:59:59.000Z',
    percentComplete: 25,
    createDate: '2024-12-15T10:00:00.000Z',
    modifyDate: '2025-06-01T08:00:00.000Z',
  }

  it('maps id and externalId', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('proj-uuid-1')
    expect(result.externalId).toBe('proj-uuid-1')
  })

  it('maps name correctly', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Platform Rewrite')
  })

  it('maps description correctly', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Full rewrite of the core platform.')
  })

  it('status active for generic active name', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status closed when status name includes "complet"', () => {
    const result = transformProject({ ...raw, status: { name: 'Completed' } })
    expect(result.status).toBe('closed')
  })

  it('status on_hold when status name includes "hold"', () => {
    const result = transformProject({ ...raw, status: { name: 'On Hold' } })
    expect(result.status).toBe('on_hold')
  })

  it('status archived when status name includes "archiv"', () => {
    const result = transformProject({ ...raw, status: { name: 'Archived' } })
    expect(result.status).toBe('archived')
  })

  it('ownerId comes from manager.id', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('mgr-uuid')
  })

  it('startDate and endDate are ISO 8601', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBe('2025-01-01T00:00:00.000Z')
    expect(result.endDate).toBe('2025-12-31T23:59:59.000Z')
  })

  it('createdAt and updatedAt are ISO 8601', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2024-12-15T10:00:00.000Z')
    expect(result.updatedAt).toBe('2025-06-01T08:00:00.000Z')
  })

  it('workspaceId is empty string (no workspace in project object)', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('')
  })

  it('platform is projectmanager', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('projectmanager')
  })

  it('metadata includes shortCode and statusName', () => {
    const result = transformProject(raw)
    expect(result.metadata.shortCode).toBe('PRW')
    expect(result.metadata.statusName).toBe('Active')
  })

  it('metadata includes percentComplete', () => {
    const result = transformProject(raw)
    expect(result.metadata.percentComplete).toBe('25')
  })

  it('startDate falls back to plannedStartDate', () => {
    const result = transformProject({
      ...raw,
      startDate: null,
      plannedStartDate: '2025-02-01T00:00:00.000Z',
    })
    expect(result.startDate).toBe('2025-02-01T00:00:00.000Z')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

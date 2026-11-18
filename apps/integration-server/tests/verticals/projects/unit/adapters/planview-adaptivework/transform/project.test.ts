import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawClarizenProject,
} from '../../../../../../../src/verticals/projects/adapters/planview-adaptivework/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('planview-adaptivework transformProject', () => {
  const raw: RawClarizenProject = {
    id: '/Project/abc-123',
    Name: 'Platform Migration',
    Description: 'Migrate to new platform',
    State: 'Active',
    StartDate: '2026-01-15T09:30:00.000Z',
    DueDate: '2026-06-30T00:00:00.000Z',
    Manager: { id: '/User/mgr-1', Name: 'Alice Manager' },
    CreatedOn: '2025-12-01T00:00:00.000Z',
    LastUpdatedOn: '2026-01-01T00:00:00.000Z',
  }

  it('maps id and externalId directly from raw.id URI', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('/Project/abc-123')
    expect(result.externalId).toBe('/Project/abc-123')
  })

  it('maps name from raw.Name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Platform Migration')
  })

  it('maps description from raw.Description', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Migrate to new platform')
  })

  it('status is active for "Active" state', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is completed for "Completed" state', () => {
    const result = transformProject({ ...raw, State: 'Completed' })
    expect(result.status).toBe('completed')
  })

  it('status is archived for "Cancelled" state', () => {
    const result = transformProject({ ...raw, State: 'Cancelled' })
    expect(result.status).toBe('archived')
  })

  it('status is on_hold for "On Hold" state', () => {
    const result = transformProject({ ...raw, State: 'On Hold' })
    expect(result.status).toBe('on_hold')
  })

  it('status is on_hold for "Draft" state', () => {
    const result = transformProject({ ...raw, State: 'Draft' })
    expect(result.status).toBe('on_hold')
  })

  it('state can be a reference object with Name', () => {
    const result = transformProject({ ...raw, State: { id: '/State/1', Name: 'Completed' } })
    expect(result.status).toBe('completed')
  })

  it('ownerId from Manager.id reference', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('/User/mgr-1')
  })

  it('ownerId is undefined when Manager absent', () => {
    const result = transformProject({ ...raw, Manager: undefined })
    expect(result.ownerId).toBeUndefined()
  })

  it('startDate from StartDate field', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBe('2026-01-15T09:30:00.000Z')
  })

  it('endDate from DueDate field', () => {
    const result = transformProject(raw)
    expect(result.endDate).toBe('2026-06-30T00:00:00.000Z')
  })

  it('createdAt from CreatedOn', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2025-12-01T00:00:00.000Z')
  })

  it('updatedAt from LastUpdatedOn', () => {
    const result = transformProject(raw)
    expect(result.updatedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('workspaceId is empty string (no per-project workspace)', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('')
  })

  it('metadata.state contains state text', () => {
    const result = transformProject(raw)
    expect(result.metadata.state).toBe('Active')
  })

  it('metadata.managerName from Manager.Name', () => {
    const result = transformProject(raw)
    expect(result.metadata.managerName).toBe('Alice Manager')
  })

  it('platform is planview-adaptivework', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('planview-adaptivework')
  })

  it('raw is preserved on output', () => {
    const result = transformProject(raw)
    expect(result.raw).toBe(raw)
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

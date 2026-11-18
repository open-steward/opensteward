import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawBigtimeProject,
} from '../../../../../../../src/verticals/projects/adapters/bigtime/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('bigtime transformProject', () => {
  const raw: RawBigtimeProject = {
    SystemId: 1001,
    Nm: 'Bridge Renovation',
    DisplayName: 'Bridge Renovation (Display)',
    ProjectCode: 'BR-2025',
    Notes: 'Main bridge renovation project',
    ClientId: 88,
    ClientNm: 'City Council',
    IsInactive: false,
    StatusProd: 2,
    ProjectMgr: 42,
    StartDt: '2025-01-01T00:00:00.000Z',
    EndDt: '2025-12-31T00:00:00.000Z',
    DtCreated: '2024-11-01T08:00:00.000Z',
    DtModified: '2025-01-05T09:30:00.000Z',
  }

  it('maps id from SystemId', () => {
    const result = transformProject(raw, 'firm_1')
    expect(result.id).toBe('1001')
    expect(result.externalId).toBe('1001')
  })

  it('maps name from Nm field', () => {
    const result = transformProject(raw, 'firm_1')
    expect(result.name).toBe('Bridge Renovation')
  })

  it('maps workspaceId from firmId arg', () => {
    const result = transformProject(raw, 'firm_1')
    expect(result.workspaceId).toBe('firm_1')
  })

  it('status is active when IsInactive is false', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived when IsInactive is true', () => {
    const result = transformProject({ ...raw, IsInactive: true })
    expect(result.status).toBe('archived')
  })

  it('maps startDate and endDate as ISO strings', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBe('2025-01-01T00:00:00.000Z')
    expect(result.endDate).toBe('2025-12-31T00:00:00.000Z')
  })

  it('maps ownerId from ProjectMgr', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('42')
  })

  it('maps description from Notes', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Main bridge renovation project')
  })

  it('platform is bigtime', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('bigtime')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw, 'firm_1')
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

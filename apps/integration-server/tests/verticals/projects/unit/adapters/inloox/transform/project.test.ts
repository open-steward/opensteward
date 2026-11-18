import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawInlooxProject,
} from '../../../../../../../src/verticals/projects/adapters/inloox/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('inloox transformProject', () => {
  const raw: RawInlooxProject = {
    ProjectId: 'proj-uuid-1234',
    Name: 'Acme Rollout',
    DescriptionHTML: '<p>Main rollout project</p>',
    StartDate: '2026-01-15T09:00:00Z',
    EndDate: '2026-06-30T17:00:00Z',
    IsArchived: false,
    IsRecycled: false,
    Priority: 3,
    ProjectStatusId: 'status-uuid-abc',
    PortfolioId: 'portfolio-uuid-xyz',
    ClientId: 'client-uuid-999',
    DivisionId: 'division-uuid-888',
    LockMode: 0,
    RiskScore: 2,
    SizeScore: 5,
    ValueScore: 8,
    NumberPrefix: 'PRJ',
    NumberSuffix: '001',
    NumberIncremential: 1,
  }

  it('maps ProjectId to id and externalId', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('proj-uuid-1234')
    expect(result.externalId).toBe('proj-uuid-1234')
  })

  it('maps PortfolioId to workspaceId', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('portfolio-uuid-xyz')
  })

  it('maps Name to name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Acme Rollout')
  })

  it('maps DescriptionHTML to description', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('<p>Main rollout project</p>')
  })

  it('status is "active" when IsArchived and IsRecycled are both false', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is "archived" when IsArchived is true', () => {
    const result = transformProject({ ...raw, IsArchived: true, IsRecycled: false })
    expect(result.status).toBe('archived')
  })

  it('status is "archived" when IsRecycled is true', () => {
    const result = transformProject({ ...raw, IsArchived: false, IsRecycled: true })
    expect(result.status).toBe('archived')
  })

  it('status is "archived" when both IsArchived and IsRecycled are true', () => {
    const result = transformProject({ ...raw, IsArchived: true, IsRecycled: true })
    expect(result.status).toBe('archived')
  })

  it('converts StartDate to ISO string', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBe(new Date('2026-01-15T09:00:00Z').toISOString())
  })

  it('converts EndDate to ISO string', () => {
    const result = transformProject(raw)
    expect(result.endDate).toBe(new Date('2026-06-30T17:00:00Z').toISOString())
  })

  it('startDate and endDate are undefined when absent', () => {
    const result = transformProject({ ...raw, StartDate: undefined, EndDate: undefined })
    expect(result.startDate).toBeUndefined()
    expect(result.endDate).toBeUndefined()
  })

  it('createdAt and updatedAt are always undefined', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('ownerId is always undefined', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBeUndefined()
  })

  it('platform is "inloox"', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('inloox')
  })

  it('metadata.priority comes from Priority as string', () => {
    const result = transformProject(raw)
    expect(result.metadata['priority']).toBe('3')
  })

  it('metadata.projectStatusId comes from ProjectStatusId', () => {
    const result = transformProject(raw)
    expect(result.metadata['projectStatusId']).toBe('status-uuid-abc')
  })

  it('metadata.clientId comes from ClientId', () => {
    const result = transformProject(raw)
    expect(result.metadata['clientId']).toBe('client-uuid-999')
  })

  it('metadata.divisionId comes from DivisionId', () => {
    const result = transformProject(raw)
    expect(result.metadata['divisionId']).toBe('division-uuid-888')
  })

  it('metadata.lockMode comes from LockMode as string', () => {
    const result = transformProject(raw)
    expect(result.metadata['lockMode']).toBe('0')
  })

  it('metadata.riskScore comes from RiskScore as string', () => {
    const result = transformProject(raw)
    expect(result.metadata['riskScore']).toBe('2')
  })

  it('metadata.sizeScore comes from SizeScore as string', () => {
    const result = transformProject(raw)
    expect(result.metadata['sizeScore']).toBe('5')
  })

  it('metadata.valueScore comes from ValueScore as string', () => {
    const result = transformProject(raw)
    expect(result.metadata['valueScore']).toBe('8')
  })

  it('metadata.numberPrefix comes from NumberPrefix', () => {
    const result = transformProject(raw)
    expect(result.metadata['numberPrefix']).toBe('PRJ')
  })

  it('metadata.numberSuffix comes from NumberSuffix', () => {
    const result = transformProject(raw)
    expect(result.metadata['numberSuffix']).toBe('001')
  })

  it('metadata keys absent when fields are undefined', () => {
    const result = transformProject({ ProjectId: 'a', Name: 'B', PortfolioId: 'ws' })
    expect(result.metadata['clientId']).toBeUndefined()
    expect(result.metadata['divisionId']).toBeUndefined()
    expect(result.metadata['riskScore']).toBeUndefined()
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it('handles minimal raw object gracefully', () => {
    const result = transformProject({})
    expect(result.id).toBe('')
    expect(result.workspaceId).toBe('')
    expect(result.name).toBe('')
    expect(result.status).toBe('active')
    expect(result.metadata).toEqual({})
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawWorkfrontProject,
} from '../../../../../../../src/verticals/projects/adapters/workfront/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('workfront transformProject', () => {
  const raw: RawWorkfrontProject = {
    ID: 'proj-5',
    name: 'Website Redesign',
    description: 'Redesign the public site',
    status: 'CUR',
    ownerID: 'user-9',
    groupID: 'group-2',
    plannedStartDate: '2024-01-15T00:00:00.000Z',
    plannedCompletionDate: '2024-06-30T00:00:00.000Z',
    entryDate: '2024-01-01T00:00:00.000Z',
    lastUpdateDate: '2024-03-01T00:00:00.000Z',
    percentComplete: 45,
  }

  it('maps id and externalId from ID', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('proj-5')
    expect(result.externalId).toBe('proj-5')
  })

  it('maps name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Website Redesign')
  })

  it('maps workspaceId from groupID', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('group-2')
  })

  it('status CUR maps to active', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status CPL maps to completed', () => {
    const result = transformProject({ ...raw, status: 'CPL' })
    expect(result.status).toBe('completed')
  })

  it('status DED maps to archived', () => {
    const result = transformProject({ ...raw, status: 'DED' })
    expect(result.status).toBe('archived')
  })

  it('status REJ maps to archived', () => {
    const result = transformProject({ ...raw, status: 'REJ' })
    expect(result.status).toBe('archived')
  })

  it('status PLN maps to on_hold', () => {
    const result = transformProject({ ...raw, status: 'PLN' })
    expect(result.status).toBe('on_hold')
  })

  it('status IDA maps to on_hold', () => {
    const result = transformProject({ ...raw, status: 'IDA' })
    expect(result.status).toBe('on_hold')
  })

  it('maps ownerId from ownerID', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('user-9')
  })

  it('maps startDate and endDate', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBe('2024-01-15T00:00:00.000Z')
    expect(result.endDate).toBe('2024-06-30T00:00:00.000Z')
  })

  it('maps createdAt from entryDate and updatedAt from lastUpdateDate', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('platform is workfront', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('workfront')
  })

  it('metadata contains statusCode and percentComplete', () => {
    const result = transformProject(raw)
    expect(result.metadata.statusCode).toBe('CUR')
    expect(result.metadata.percentComplete).toBe('45')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    // Note: mapStatus returns 'unknown' for unrecognized codes — ProjectSchema uses withUnknown so 'unknown' is valid
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawBuildertrendJob,
} from '../../../../../../../src/verticals/projects/adapters/buildertrend/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('buildertrend transformProject', () => {
  const raw: RawBuildertrendJob = {
    id: 200,
    jobName: 'Sunset Townhomes',
    description: 'New construction townhome project',
    status: 'Open',
    builderId: 10,
    projectManagerId: 55,
    contractStartDate: '2025-01-01T00:00:00.000Z',
    projectedFinishDate: '2025-12-31T00:00:00.000Z',
    createdDate: '2024-10-01T08:00:00.000Z',
    modifiedDate: '2025-02-01T09:00:00.000Z',
  }

  it('maps id from id field', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('200')
    expect(result.externalId).toBe('200')
  })

  it('maps name from jobName', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Sunset Townhomes')
  })

  it('falls back to name when jobName absent', () => {
    const result = transformProject({ ...raw, jobName: undefined, name: 'Fallback Name' })
    expect(result.name).toBe('Fallback Name')
  })

  it('workspaceId from builderId', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('10')
  })

  it('ownerId from projectManagerId', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('55')
  })

  it('status is active for Open', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is completed for Closed', () => {
    const result = transformProject({ ...raw, status: 'Closed' })
    expect(result.status).toBe('completed')
  })

  it('status is archived for Inactive', () => {
    const result = transformProject({ ...raw, status: 'Inactive' })
    expect(result.status).toBe('archived')
  })

  it('status is on_hold for Presale', () => {
    const result = transformProject({ ...raw, status: 'Presale' })
    expect(result.status).toBe('on_hold')
  })

  it('startDate maps from contractStartDate', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBe('2025-01-01T00:00:00.000Z')
  })

  it('endDate maps from projectedFinishDate', () => {
    const result = transformProject(raw)
    expect(result.endDate).toBe('2025-12-31T00:00:00.000Z')
  })

  it('createdAt and updatedAt map to ISO', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2024-10-01T08:00:00.000Z')
    expect(result.updatedAt).toBe('2025-02-01T09:00:00.000Z')
  })

  it('platform is buildertrend', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('buildertrend')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

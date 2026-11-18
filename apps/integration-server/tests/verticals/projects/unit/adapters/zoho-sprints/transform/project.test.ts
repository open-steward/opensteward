import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawZohoSprintsProject,
} from '../../../../../../../src/verticals/projects/adapters/zoho-sprints/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('zoho-sprints transformProject', () => {
  const raw: RawZohoSprintsProject = {
    projId: 'proj-55',
    name: 'Rocket Launch',
    desc: 'Get to orbit.',
    status: 1,
    ownerId: 'owner-7',
    startDate: 1704067200000,
    endDate: 1706745600000,
    createdTime: 1704067200000,
    lastModifiedTime: 1704153600000,
    prefix: 'RL',
    projNo: '42',
    teamId: 'team-9',
  }

  it('maps id and externalId from projId', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('proj-55')
    expect(result.externalId).toBe('proj-55')
  })

  it('maps name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Rocket Launch')
  })

  it('maps description from desc', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Get to orbit.')
  })

  it('maps workspaceId from teamId field when no arg supplied', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('team-9')
  })

  it('caller-supplied teamId takes precedence over raw.teamId', () => {
    const result = transformProject(raw, 'team-override')
    expect(result.workspaceId).toBe('team-override')
  })

  it('maps ownerId', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('owner-7')
  })

  it('status 1 maps to active', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status 2 maps to archived', () => {
    const result = transformProject({ ...raw, status: 2 })
    expect(result.status).toBe('archived')
  })

  it('status 6 (Template) maps to archived', () => {
    const result = transformProject({ ...raw, status: 6 })
    expect(result.status).toBe('archived')
  })

  it('string status "2" maps to archived', () => {
    const result = transformProject({ ...raw, status: '2' })
    expect(result.status).toBe('archived')
  })

  it('converts epoch-ms startDate and endDate to ISO', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBe('2024-01-01T00:00:00.000Z')
    expect(result.endDate).toBe('2024-02-01T00:00:00.000Z')
  })

  it('converts epoch-ms createdTime and lastModifiedTime to ISO', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-01-02T00:00:00.000Z')
  })

  it('platform is zoho-sprints', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('zoho-sprints')
  })

  it('metadata includes prefix and projNo', () => {
    const result = transformProject(raw)
    expect(result.metadata['prefix']).toBe('RL')
    expect(result.metadata['projNo']).toBe('42')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

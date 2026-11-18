import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawGooddayProject,
} from '../../../../../../../src/verticals/projects/adapters/goodday/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('goodday transformProject', () => {
  const raw: RawGooddayProject = {
    id: 'proj_abc',
    name: 'Acme Onboarding',
    description: 'Onboard the Acme team.',
    startDate: 1700000000000,
    endDate: 1702000000000,
    deadline: 1703000000000,
    moment_created: 1699000000000,
    parentProjectId: 'proj_parent',
    priority: 3,
    progress: 45,
    systemStatus: 'open',
    statusId: 'status_1',
    statusComments: 'On track',
    color: '#FF5733',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('proj_abc')
    expect(result.externalId).toBe('proj_abc')
  })

  it('workspaceId is always empty string', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('')
  })

  it('ownerId is always undefined', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBeUndefined()
  })

  it('maps name from raw.name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Acme Onboarding')
  })

  it('maps description from raw.description', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Onboard the Acme team.')
  })

  it('status is active when systemStatus is open', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived when systemStatus is closed', () => {
    const result = transformProject({ ...raw, systemStatus: 'closed' })
    expect(result.status).toBe('archived')
  })

  it('status is archived when systemStatus is cancelled', () => {
    const result = transformProject({ ...raw, systemStatus: 'cancelled' })
    expect(result.status).toBe('archived')
  })

  it('status is archived when systemStatus is canceled (single l)', () => {
    const result = transformProject({ ...raw, systemStatus: 'canceled' })
    expect(result.status).toBe('archived')
  })

  it('status is on_hold when systemStatus is on_hold', () => {
    const result = transformProject({ ...raw, systemStatus: 'on_hold' })
    expect(result.status).toBe('on_hold')
  })

  it('status is active when systemStatus is absent', () => {
    const result = transformProject({ id: 'proj_x' })
    expect(result.status).toBe('active')
  })

  it('status comparison is case-insensitive', () => {
    const result = transformProject({ ...raw, systemStatus: 'CLOSED' })
    expect(result.status).toBe('archived')
  })

  it('startDate converts epoch ms to ISO string', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBe(new Date(1700000000000).toISOString())
  })

  it('endDate prefers endDate over deadline', () => {
    const result = transformProject(raw)
    expect(result.endDate).toBe(new Date(1702000000000).toISOString())
  })

  it('endDate falls back to deadline when endDate is absent', () => {
    const result = transformProject({ ...raw, endDate: undefined })
    expect(result.endDate).toBe(new Date(1703000000000).toISOString())
  })

  it('createdAt converts epoch ms to ISO string from moment_created', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe(new Date(1699000000000).toISOString())
  })

  it('updatedAt is always undefined', () => {
    const result = transformProject(raw)
    expect(result.updatedAt).toBeUndefined()
  })

  it('platform is goodday', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('goodday')
  })

  it('metadata.parentProjectId reflects raw.parentProjectId', () => {
    const result = transformProject(raw)
    expect(result.metadata['parentProjectId']).toBe('proj_parent')
  })

  it('metadata.priority reflects raw.priority', () => {
    const result = transformProject(raw)
    expect(result.metadata['priority']).toBe('3')
  })

  it('metadata.progress reflects raw.progress', () => {
    const result = transformProject(raw)
    expect(result.metadata['progress']).toBe('45')
  })

  it('metadata.color reflects raw.color', () => {
    const result = transformProject(raw)
    expect(result.metadata['color']).toBe('#FF5733')
  })

  it('metadata.statusId reflects raw.statusId', () => {
    const result = transformProject(raw)
    expect(result.metadata['statusId']).toBe('status_1')
  })

  it('metadata omits null parentProjectId', () => {
    const result = transformProject({ ...raw, parentProjectId: null })
    expect(result.metadata['parentProjectId']).toBeUndefined()
  })

  it('name is empty string when raw.name is absent', () => {
    const result = transformProject({ id: 'proj_x' })
    expect(result.name).toBe('')
  })

  it('passes ProjectSchema.parse with full raw', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it('passes ProjectSchema.parse with minimal raw', () => {
    const result = transformProject({ id: 'proj_min' })
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

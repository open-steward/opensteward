import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawFactroProject,
} from '../../../../../../../src/verticals/projects/adapters/factro/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('factro transformProject', () => {
  const raw: RawFactroProject = {
    id: 'proj-42',
    title: 'Platform Migration',
    description: 'Migrate services to new infra.',
    startDate: '2024-01-01T00:00:00.000Z',
    endDate: '2024-06-30T00:00:00.000Z',
    createDate: '2023-12-01T08:00:00.000Z',
    changeDate: '2024-02-15T10:00:00.000Z',
    officerId: 'user-lead',
    creatorId: 'user-creator',
    mandantId: 'mandant-1',
    projectState: 'inProcess',
    isArchived: false,
    isDraft: false,
    companyId: 'company-acme',
    priority: 2,
    number: 7,
  }

  it('maps id and externalId', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('proj-42')
    expect(result.externalId).toBe('proj-42')
  })

  it('maps workspaceId from mandantId', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('mandant-1')
  })

  it('maps name from title', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Platform Migration')
  })

  it('maps description', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Migrate services to new infra.')
  })

  it('status is active for inProcess state', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is completed for closed state', () => {
    const result = transformProject({ ...raw, projectState: 'closed' })
    expect(result.status).toBe('completed')
  })

  it('status is archived for stopped state', () => {
    const result = transformProject({ ...raw, projectState: 'stopped' })
    expect(result.status).toBe('archived')
  })

  it('status is on_hold for pushedBack state', () => {
    const result = transformProject({ ...raw, projectState: 'pushedBack' })
    expect(result.status).toBe('on_hold')
  })

  it('isArchived takes priority over projectState', () => {
    const result = transformProject({ ...raw, projectState: 'inProcess', isArchived: true })
    expect(result.status).toBe('archived')
  })

  it('isDraft maps to planning status', () => {
    const result = transformProject({ ...raw, projectState: undefined, isDraft: true })
    expect(result.status).toBe('planning')
  })

  it('maps ownerId from officerId', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('user-lead')
  })

  it('falls back to creatorId when officerId is absent', () => {
    const result = transformProject({ ...raw, officerId: undefined })
    expect(result.ownerId).toBe('user-creator')
  })

  it('startDate parses ISO datetime', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBe('2024-01-01T00:00:00.000Z')
  })

  it('createdAt parses ISO datetime from createDate', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2023-12-01T08:00:00.000Z')
  })

  it('platform is factro', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('factro')
  })

  it('metadata.projectState reflects projectState', () => {
    const result = transformProject(raw)
    expect(result.metadata.projectState).toBe('inProcess')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawGanttproProject,
} from '../../../../../../../src/verticals/projects/adapters/ganttpro/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

const rawProject: RawGanttproProject = {
  projectId: 42,
  name: 'Launch Campaign',
  description: 'Q3 product launch',
  isFavorite: true,
  favoriteOrder: 1,
  lastUpdate: '2026-05-10T08:00:00Z',
  ownerId: 99,
  startProject: '2026-04-01T00:00:00Z',
}

describe('transformProject', () => {
  it('maps projectId to id as a string', () => {
    const result = transformProject(rawProject)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps name directly', () => {
    const result = transformProject(rawProject)
    expect(result.name).toBe('Launch Campaign')
  })

  it('hardcodes status to "active"', () => {
    const result = transformProject(rawProject)
    expect(result.status).toBe('active')
  })

  it('sets workspaceId to empty string', () => {
    const result = transformProject(rawProject)
    expect(result.workspaceId).toBe('')
  })

  it('maps lastUpdate to updatedAt as ISO string', () => {
    const result = transformProject(rawProject)
    expect(result.updatedAt).toBe('2026-05-10T08:00:00.000Z')
  })

  it('maps ownerId to ownerId as string', () => {
    const result = transformProject(rawProject)
    expect(result.ownerId).toBe('99')
  })

  it('maps startProject to startDate as ISO string', () => {
    const result = transformProject(rawProject)
    expect(result.startDate).toBe('2026-04-01T00:00:00.000Z')
  })

  it('sets platform to "ganttpro"', () => {
    const result = transformProject(rawProject)
    expect(result.platform).toBe('ganttpro')
  })

  it('passes schema validation', () => {
    const result = transformProject(rawProject)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it('handles numeric string projectId', () => {
    const result = transformProject({ ...rawProject, projectId: '123' })
    expect(result.id).toBe('123')
  })

  it('omits ownerId when not present', () => {
    const result = transformProject({ projectId: 1, name: 'Minimal' })
    expect(result.ownerId).toBeUndefined()
  })
})

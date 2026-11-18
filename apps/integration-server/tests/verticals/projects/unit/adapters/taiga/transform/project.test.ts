import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawTaigaProject,
} from '../../../../../../../src/verticals/projects/adapters/taiga/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('taiga transformProject', () => {
  const raw: RawTaigaProject = {
    id: 88,
    name: 'Taiga Demo Project',
    slug: 'taiga-demo-project',
    description: 'A demo project for testing.',
    is_private: false,
    owner: { id: 5, username: 'alice' },
    created_date: '2026-01-01T00:00:00.000Z',
    modified_date: '2026-03-15T00:00:00.000Z',
    total_milestones: 3,
    total_fans: 10,
    total_activity: 50,
    tags_colors: { frontend: '#ff0000', backend: null },
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('88')
    expect(result.externalId).toBe('88')
  })

  it('maps name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Taiga Demo Project')
  })

  it('maps description', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('A demo project for testing.')
  })

  it('workspaceId is always empty string', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('')
  })

  it('status is always active', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('maps ownerId from owner.id', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('5')
  })

  it('ownerId is undefined when owner is absent', () => {
    const result = transformProject({ id: 1 })
    expect(result.ownerId).toBeUndefined()
  })

  it('maps createdAt from created_date', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('maps updatedAt from modified_date', () => {
    const result = transformProject(raw)
    expect(result.updatedAt).toBe('2026-03-15T00:00:00.000Z')
  })

  it('stores slug in metadata', () => {
    const result = transformProject(raw)
    expect(result.metadata.slug).toBe('taiga-demo-project')
  })

  it('stores totalMilestones in metadata', () => {
    const result = transformProject(raw)
    expect(result.metadata.totalMilestones).toBe('3')
  })

  it('platform is taiga', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('taiga')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

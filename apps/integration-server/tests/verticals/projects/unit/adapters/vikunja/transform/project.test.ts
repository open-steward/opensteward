import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawVikunjaProject,
} from '../../../../../../../src/verticals/projects/adapters/vikunja/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('vikunja transformProject', () => {
  const raw: RawVikunjaProject = {
    id: 10,
    title: 'My Project',
    description: 'A test project',
    identifier: 'MP',
    hex_color: '#ff0000',
    owner: {
      id: 5,
      username: 'alice',
      name: 'Alice',
      email: 'alice@example.com',
    },
    parent_project_id: 3,
    is_archived: false,
    is_favorite: true,
    position: 1,
    created: '2024-01-01T00:00:00.000Z',
    updated: '2024-06-01T00:00:00.000Z',
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('10')
    expect(result.externalId).toBe('10')
  })

  it('maps name from title', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('My Project')
  })

  it('maps description', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('A test project')
  })

  it('maps workspaceId from parent_project_id', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('3')
  })

  it('workspaceId is "0" for top-level projects', () => {
    const r: RawVikunjaProject = { id: 1, parent_project_id: null }
    const result = transformProject(r)
    expect(result.workspaceId).toBe('0')
  })

  it('maps status to active when not archived', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('maps status to archived when is_archived is true', () => {
    const r: RawVikunjaProject = { id: 2, is_archived: true }
    const result = transformProject(r)
    expect(result.status).toBe('archived')
  })

  it('maps ownerId from owner.id', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('5')
  })

  it('ownerId is undefined when owner has no id', () => {
    const r: RawVikunjaProject = { id: 3, owner: { username: 'nobody' } }
    const result = transformProject(r)
    expect(result.ownerId).toBeUndefined()
  })

  it('maps createdAt to ISO string', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
  })

  it('maps updatedAt to ISO string', () => {
    const result = transformProject(raw)
    expect(result.updatedAt).toBe('2024-06-01T00:00:00.000Z')
  })

  it('platform is vikunja', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('vikunja')
  })

  it('metadata contains identifier and hexColor', () => {
    const result = transformProject(raw)
    expect(result.metadata.identifier).toBe('MP')
    expect(result.metadata.hexColor).toBe('#ff0000')
  })

  it('metadata contains isFavorite as string', () => {
    const result = transformProject(raw)
    expect(result.metadata.isFavorite).toBe('true')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

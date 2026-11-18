import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawWekanBoard,
} from '../../../../../../../src/verticals/projects/adapters/wekan/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'
import { VIRTUAL_WORKSPACE_ID } from '../../../../../../../src/verticals/projects/adapters/wekan/constants'

describe('wekan transformProject', () => {
  const raw: RawWekanBoard = {
    _id: 'board-1',
    title: 'Sprint Board',
    description: 'Our main sprint board',
    slug: 'sprint-board',
    archived: false,
    createdAt: '2024-01-10T09:00:00.000Z',
    modifiedAt: '2024-01-20T15:00:00.000Z',
    permission: 'public',
    color: 'blue',
    stars: 3,
    members: [
      { userId: 'user-1', isAdmin: true, isActive: true },
      { userId: 'user-2', isAdmin: false, isActive: true },
    ],
  }

  it('maps id and externalId from _id', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('board-1')
    expect(result.externalId).toBe('board-1')
  })

  it('maps name from title', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Sprint Board')
  })

  it('uses VIRTUAL_WORKSPACE_ID as workspaceId', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe(VIRTUAL_WORKSPACE_ID)
  })

  it('status is active when not archived', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived when archived=true', () => {
    const result = transformProject({ ...raw, archived: true })
    expect(result.status).toBe('archived')
  })

  it('ownerId is first active admin member', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('user-1')
  })

  it('platform is wekan', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('wekan')
  })

  it('metadata contains slug, permission, color, stars', () => {
    const result = transformProject(raw)
    expect(result.metadata.slug).toBe('sprint-board')
    expect(result.metadata.permission).toBe('public')
    expect(result.metadata.color).toBe('blue')
    expect(result.metadata.stars).toBe('3')
  })

  it('createdAt and updatedAt are ISO strings', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2024-01-10T09:00:00.000Z')
    expect(result.updatedAt).toBe('2024-01-20T15:00:00.000Z')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

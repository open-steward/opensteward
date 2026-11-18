import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawTodoTaskList,
} from '../../../../../../../src/verticals/projects/adapters/microsoft-todo/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('microsoft-todo transformProject', () => {
  const raw: RawTodoTaskList = {
    id: 'list-guid-001',
    displayName: 'My Work Tasks',
    isOwner: true,
    isShared: false,
    wellknownListName: 'none',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('list-guid-001')
    expect(result.externalId).toBe('list-guid-001')
  })

  it('maps name from displayName', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('My Work Tasks')
  })

  it('workspaceId defaults to "me"', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('me')
  })

  it('caller can supply a custom workspaceId', () => {
    const result = transformProject(raw, 'user-guid-abc')
    expect(result.workspaceId).toBe('user-guid-abc')
  })

  it('status is always active (lists have no lifecycle status)', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('platform is microsoft-todo', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('microsoft-todo')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it('handles a default (wellknown) list', () => {
    const result = transformProject({ id: 'default-id', wellknownListName: 'defaultList' })
    expect(result.status).toBe('active')
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

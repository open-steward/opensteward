import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawBusinessmapBoard,
} from '../../../../../../../src/verticals/projects/adapters/businessmap/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('businessmap transformProject', () => {
  const raw: RawBusinessmapBoard = {
    board_id: 42,
    workspace_id: 7,
    name: 'Sprint Alpha',
    description: 'First sprint board.',
    is_archived: 0,
    revision: 3,
    created_at: '2024-01-10T08:00:00.000Z',
    updated_at: '2024-02-01T12:00:00.000Z',
  }

  it('maps id and externalId from board_id', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps workspaceId from workspace_id', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('7')
  })

  it('maps name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Sprint Alpha')
  })

  it('maps description', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('First sprint board.')
  })

  it('status is active when is_archived is 0', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived when is_archived is 1', () => {
    const result = transformProject({ ...raw, is_archived: 1 })
    expect(result.status).toBe('archived')
  })

  it('createdAt parses ISO datetime', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2024-01-10T08:00:00.000Z')
  })

  it('updatedAt parses ISO datetime', () => {
    const result = transformProject(raw)
    expect(result.updatedAt).toBe('2024-02-01T12:00:00.000Z')
  })

  it('platform is businessmap', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('businessmap')
  })

  it('metadata.revision reflects revision', () => {
    const result = transformProject(raw)
    expect(result.metadata.revision).toBe('3')
  })

  it('ownerId is always undefined (not on board object)', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBeUndefined()
  })

  it('workspaceId is empty string when workspace_id is absent', () => {
    const result = transformProject({ board_id: 1 })
    expect(result.workspaceId).toBe('')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

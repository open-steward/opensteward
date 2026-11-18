import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawNuclinoWorkspace,
} from '../../../../../../../src/verticals/projects/adapters/nuclino/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

function makeWorkspace(overrides: Partial<RawNuclinoWorkspace> = {}): RawNuclinoWorkspace {
  return {
    object: 'workspace',
    id: 'ws-nuclino-1',
    teamId: 'team-alpha',
    name: 'Engineering Docs',
    createdAt: '2024-01-10T10:00:00.000Z',
    createdUserId: 'usr-jane',
    childIds: ['item-1', 'item-2', 'item-3'],
    ...overrides,
  }
}

describe('nuclino transformProject', () => {
  it('maps id and externalId from raw.id', () => {
    const result = transformProject(makeWorkspace())
    expect(result.id).toBe('ws-nuclino-1')
    expect(result.externalId).toBe('ws-nuclino-1')
  })

  it('maps workspaceId from raw.teamId', () => {
    const result = transformProject(makeWorkspace())
    expect(result.workspaceId).toBe('team-alpha')
  })

  it('workspaceId is empty string when teamId is absent', () => {
    const result = transformProject(makeWorkspace({ teamId: undefined }))
    expect(result.workspaceId).toBe('')
  })

  it('maps name from raw.name', () => {
    const result = transformProject(makeWorkspace())
    expect(result.name).toBe('Engineering Docs')
  })

  it('description is always undefined', () => {
    const result = transformProject(makeWorkspace())
    expect(result.description).toBeUndefined()
  })

  it('status is always active', () => {
    const result = transformProject(makeWorkspace())
    expect(result.status).toBe('active')
  })

  it('maps ownerId from raw.createdUserId', () => {
    const result = transformProject(makeWorkspace())
    expect(result.ownerId).toBe('usr-jane')
  })

  it('maps createdAt from raw.createdAt', () => {
    const result = transformProject(makeWorkspace())
    expect(result.createdAt).toBe('2024-01-10T10:00:00.000Z')
  })

  it('updatedAt mirrors createdAt (no separate updatedAt field)', () => {
    const result = transformProject(makeWorkspace())
    expect(result.updatedAt).toBe('2024-01-10T10:00:00.000Z')
  })

  it('platform is nuclino', () => {
    const result = transformProject(makeWorkspace())
    expect(result.platform).toBe('nuclino')
  })

  it('metadata.childCount reflects childIds length as string', () => {
    const result = transformProject(makeWorkspace())
    expect(result.metadata.childCount).toBe('3')
  })

  it('metadata.childCount is undefined when childIds absent', () => {
    const result = transformProject(makeWorkspace({ childIds: undefined }))
    expect(result.metadata.childCount).toBeUndefined()
  })

  it('passes ProjectSchema.parse without throwing', () => {
    const result = transformProject(makeWorkspace())
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

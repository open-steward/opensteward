import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawNocodbBase,
} from '../../../../../../../src/verticals/projects/adapters/nocodb/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

function makeBase(overrides: Partial<RawNocodbBase> = {}): RawNocodbBase {
  return {
    id: 'p_abc123',
    title: 'Sales Pipeline',
    type: 'database',
    status: 'active',
    fk_workspace_id: 'ws-1',
    color: '#3B82F6',
    created_at: '2024-01-10T09:00:00.000Z',
    updated_at: '2024-02-20T16:00:00.000Z',
    ...overrides,
  }
}

describe('nocodb transformProject', () => {
  it('maps id and externalId from raw.id', () => {
    const result = transformProject(makeBase())
    expect(result.id).toBe('p_abc123')
    expect(result.externalId).toBe('p_abc123')
  })

  it('maps workspaceId from raw.fk_workspace_id', () => {
    const result = transformProject(makeBase())
    expect(result.workspaceId).toBe('ws-1')
  })

  it('workspaceId is empty string when fk_workspace_id absent', () => {
    const result = transformProject(makeBase({ fk_workspace_id: undefined }))
    expect(result.workspaceId).toBe('')
  })

  it('maps name from raw.title', () => {
    const result = transformProject(makeBase())
    expect(result.name).toBe('Sales Pipeline')
  })

  it('description is always undefined', () => {
    const result = transformProject(makeBase())
    expect(result.description).toBeUndefined()
  })

  it('status is active when raw.status is active', () => {
    const result = transformProject(makeBase({ status: 'active' }))
    expect(result.status).toBe('active')
  })

  it('status is archived when raw.status is archived', () => {
    const result = transformProject(makeBase({ status: 'archived' }))
    expect(result.status).toBe('archived')
  })

  it('status defaults to active when raw.status is absent', () => {
    const result = transformProject(makeBase({ status: undefined }))
    expect(result.status).toBe('active')
  })

  it('ownerId is always undefined', () => {
    const result = transformProject(makeBase())
    expect(result.ownerId).toBeUndefined()
  })

  it('maps createdAt from raw.created_at', () => {
    const result = transformProject(makeBase())
    expect(result.createdAt).toBe('2024-01-10T09:00:00.000Z')
  })

  it('maps updatedAt from raw.updated_at', () => {
    const result = transformProject(makeBase())
    expect(result.updatedAt).toBe('2024-02-20T16:00:00.000Z')
  })

  it('platform is nocodb', () => {
    const result = transformProject(makeBase())
    expect(result.platform).toBe('nocodb')
  })

  it('metadata.type reflects raw.type', () => {
    const result = transformProject(makeBase())
    expect(result.metadata.type).toBe('database')
  })

  it('metadata.color reflects raw.color', () => {
    const result = transformProject(makeBase())
    expect(result.metadata.color).toBe('#3B82F6')
  })

  it('passes ProjectSchema.parse without throwing', () => {
    const result = transformProject(makeBase())
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

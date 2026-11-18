import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawPingcodeProject,
} from '../../../../../../../src/verticals/projects/adapters/pingcode/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('transformProject', () => {
  it('maps an active project with all standard fields', () => {
    const raw: RawPingcodeProject = {
      id: 'proj_001',
      identifier: 'PROJ',
      name: 'Alpha Sprint',
      description: 'First sprint cycle.',
      type: 'scrum',
      is_archived: false,
      principal: { id: 'usr_jane' },
      created_at: 1705320000,
      updated_at: 1705406400,
    }

    const result = transformProject(raw)

    expect(result.id).toBe('proj_001')
    expect(result.externalId).toBe('proj_001')
    expect(result.name).toBe('Alpha Sprint')
    expect(result.status).toBe('active')
    expect(result.workspaceId).toBe('')
    expect(result.ownerId).toBe('usr_jane')
    expect(result.platform).toBe('pingcode')
    expect(result.createdAt).toBe(new Date(1705320000 * 1000).toISOString())
    expect(result.metadata.identifier).toBe('PROJ')
    expect(result.metadata.type).toBe('scrum')
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it('maps status to archived when is_archived is true', () => {
    const raw: RawPingcodeProject = {
      id: 'proj_002',
      is_archived: true,
    }

    const result = transformProject(raw)

    expect(result.status).toBe('archived')
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it('resolves ownerId from principal as a string', () => {
    const raw: RawPingcodeProject = {
      id: 'proj_003',
      principal: 'usr_bob',
    }

    const result = transformProject(raw)

    expect(result.ownerId).toBe('usr_bob')
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it('falls back to created_by when principal is null', () => {
    const raw: RawPingcodeProject = {
      id: 'proj_004',
      principal: null,
      created_by: 'usr_charlie',
    }

    const result = transformProject(raw)

    expect(result.ownerId).toBe('usr_charlie')
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it('handles missing optional fields gracefully', () => {
    const raw: RawPingcodeProject = {
      id: 'proj_005',
    }

    const result = transformProject(raw)

    expect(result.id).toBe('proj_005')
    expect(result.name).toBe('')
    expect(result.description).toBeUndefined()
    expect(result.ownerId).toBeUndefined()
    expect(result.status).toBe('active')
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawAirtableProject,
} from '../../../../../../../src/verticals/projects/adapters/zenkit/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('zenkit transformProject', () => {
  const raw: RawAirtableProject = {
    gid: 'proj-gid-1',
    name: 'Q1 Launch',
    notes: 'Q1 product launch',
    archived: false,
    current_status: { color: 'green', text: 'On track' },
    owner: { gid: 'user-gid-1' },
    workspace: { gid: 'ws-gid-1', name: 'Acme' },
    start_on: '2024-01-01',
    due_on: '2024-03-31',
    created_at: '2024-01-01T00:00:00.000Z',
    modified_at: '2024-02-01T00:00:00.000Z',
  }

  it('maps id and externalId from gid', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('proj-gid-1')
    expect(result.externalId).toBe('proj-gid-1')
  })

  it('maps name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Q1 Launch')
  })

  it('maps description from notes', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Q1 product launch')
  })

  it('maps workspaceId from workspace.gid', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('ws-gid-1')
  })

  it('workspaceId is empty string when workspace absent', () => {
    const result = transformProject({ ...raw, workspace: undefined })
    expect(result.workspaceId).toBe('')
  })

  it('maps ownerId from owner.gid', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('user-gid-1')
  })

  it('ownerId is undefined when owner absent', () => {
    const result = transformProject({ ...raw, owner: undefined })
    expect(result.ownerId).toBeUndefined()
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-02-01T00:00:00.000Z')
  })

  it('platform is zenkit', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('zenkit')
  })

  describe('status mapping', () => {
    it('archived=true maps to archived', () => {
      const result = transformProject({ ...raw, archived: true })
      expect(result.status).toBe('archived')
    })

    it('green current_status maps to active', () => {
      const result = transformProject({ ...raw, current_status: { color: 'green' } })
      expect(result.status).toBe('active')
    })

    it('blue current_status maps to on_hold', () => {
      const result = transformProject({ ...raw, current_status: { color: 'blue' } })
      expect(result.status).toBe('on_hold')
    })

    it('red current_status maps to on_hold', () => {
      const result = transformProject({ ...raw, current_status: { color: 'red' } })
      expect(result.status).toBe('on_hold')
    })

    it('absent current_status maps to active (default)', () => {
      const result = transformProject({ ...raw, current_status: null })
      expect(result.status).toBe('active')
    })

    it('unknown color maps to active (default)', () => {
      const result = transformProject({ ...raw, current_status: { color: 'yellow' } })
      expect(result.status).toBe('active')
    })
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

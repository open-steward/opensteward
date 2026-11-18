import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawTapdProject,
} from '../../../../../../../src/verticals/projects/adapters/tapd/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('tapd transformProject', () => {
  const raw: RawTapdProject = {
    id: 'ws_12345',
    name: 'tapd-project',
    pretty_name: 'TAPD Project',
    description: 'Main development project.',
    status: 'active',
    category: 'software',
    creator: 'alice',
    creator_id: 'uid_001',
    created: '2026-01-01T00:00:00.000Z',
    begin_date: '2026-01-05',
    end_date: '2026-12-31',
    company_id: 'co_999',
    parent_id: '0',
    objective: 'Build great software.',
    closed: '0',
  }

  it('maps id and externalId from string id', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('ws_12345')
    expect(result.externalId).toBe('ws_12345')
  })

  it('prefers pretty_name over name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('TAPD Project')
  })

  it('falls back to name when pretty_name is absent', () => {
    const result = transformProject({ ...raw, pretty_name: undefined })
    expect(result.name).toBe('tapd-project')
  })

  it('maps description from description field', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Main development project.')
  })

  it('falls back to objective when description is absent', () => {
    const result = transformProject({ ...raw, description: undefined })
    expect(result.description).toBe('Build great software.')
  })

  it('maps workspaceId from company_id', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('co_999')
  })

  it('status is active when closed is "0" and status is "active"', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived when closed is "1"', () => {
    const result = transformProject({ ...raw, closed: '1' })
    expect(result.status).toBe('archived')
  })

  it('status is archived when status is "archived"', () => {
    const result = transformProject({ ...raw, status: 'archived' })
    expect(result.status).toBe('archived')
  })

  it('status is archived when status is "closed"', () => {
    const result = transformProject({ ...raw, status: 'closed' })
    expect(result.status).toBe('archived')
  })

  it('prefers creator_id over creator for ownerId', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('uid_001')
  })

  it('falls back to creator when creator_id is absent', () => {
    const result = transformProject({ ...raw, creator_id: undefined })
    expect(result.ownerId).toBe('alice')
  })

  it('updatedAt is always undefined', () => {
    const result = transformProject(raw)
    expect(result.updatedAt).toBeUndefined()
  })

  it('metadata contains category', () => {
    const result = transformProject(raw)
    expect(result.metadata.category).toBe('software')
  })

  it('platform is tapd', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('tapd')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

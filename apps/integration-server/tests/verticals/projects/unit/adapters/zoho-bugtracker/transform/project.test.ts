import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawZohoBugtrackerProject,
} from '../../../../../../../src/verticals/projects/adapters/zoho-bugtracker/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('zoho-bugtracker transformProject', () => {
  const raw: RawZohoBugtrackerProject = {
    id: 5001,
    id_string: 'proj-5001',
    name: 'Bug Tracker Project',
    description: 'Track all bugs here',
    status: 'active',
    owner_id: '99',
    owner_name: 'Alice',
    created_date: '2024-01-01',
    created_date_long: 1704067200000,
    start_date: '2024-01-15',
    start_date_long: 1705276800000,
    end_date: '2024-12-31',
    end_date_long: 1735603200000,
    last_modified_date: '2024-02-01T00:00:00.000Z',
    bug_count: { open: 12, closed: 45 },
    workspace_id: 'portal-1',
  }

  it('uses id_string as id when present', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('proj-5001')
    expect(result.externalId).toBe('proj-5001')
  })

  it('falls back to string of numeric id when id_string absent', () => {
    const result = transformProject({ ...raw, id_string: undefined })
    expect(result.id).toBe('5001')
  })

  it('maps name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Bug Tracker Project')
  })

  it('maps description', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Track all bugs here')
  })

  it('maps workspaceId from portalId argument when provided', () => {
    const result = transformProject(raw, 'override-portal')
    expect(result.workspaceId).toBe('override-portal')
  })

  it('maps workspaceId from workspace_id when portalId absent', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('portal-1')
  })

  it('workspaceId is empty string when both portal and workspace_id absent', () => {
    const result = transformProject({ ...raw, workspace_id: undefined })
    expect(result.workspaceId).toBe('')
  })

  it('maps ownerId from owner_id as string', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('99')
  })

  it('ownerId is undefined when owner_id absent', () => {
    const result = transformProject({ ...raw, owner_id: undefined })
    expect(result.ownerId).toBeUndefined()
  })

  it('maps startDate and endDate from _long fields', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBeDefined()
    expect(result.endDate).toBeDefined()
  })

  it('maps updatedAt from last_modified_date', () => {
    const result = transformProject(raw)
    expect(result.updatedAt).toBe('2024-02-01T00:00:00.000Z')
  })

  it('platform is zoho-bugtracker', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('zoho-bugtracker')
  })

  it('metadata includes ownerName, openBugs, closedBugs', () => {
    const result = transformProject(raw)
    expect(result.metadata.ownerName).toBe('Alice')
    expect(result.metadata.openBugs).toBe('12')
    expect(result.metadata.closedBugs).toBe('45')
  })

  describe('status mapping', () => {
    it('"active" maps to active', () => {
      const result = transformProject({ ...raw, status: 'active' })
      expect(result.status).toBe('active')
    })

    it('"archived" maps to archived', () => {
      const result = transformProject({ ...raw, status: 'archived' })
      expect(result.status).toBe('archived')
    })

    it('"template" maps to archived', () => {
      const result = transformProject({ ...raw, status: 'template' })
      expect(result.status).toBe('archived')
    })

    it('unknown status maps to active (default)', () => {
      const result = transformProject({ ...raw, status: 'unknown' })
      expect(result.status).toBe('active')
    })

    it('absent status maps to active (default)', () => {
      const result = transformProject({ ...raw, status: undefined })
      expect(result.status).toBe('active')
    })
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw, 'override-portal')
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

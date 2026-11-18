import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawOraProject,
} from '../../../../../../../src/verticals/projects/adapters/ora/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('ora transformProject', () => {
  const raw: RawOraProject = {
    id: 'proj_55',
    name: 'Landing Page',
    description: 'Revamp the landing page design.',
    archived: false,
    organization_id: 'org_10',
    owner_id: 'usr_5',
    created_at: '2026-01-10T00:00:00.000Z',
    updated_at: '2026-05-20T00:00:00.000Z',
  }

  it('maps id and name', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('proj_55')
    expect(result.name).toBe('Landing Page')
  })

  it('maps description', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Revamp the landing page design.')
  })

  it('maps workspaceId from organization_id', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('org_10')
  })

  it('workspaceId is empty string when organization_id is absent', () => {
    const result = transformProject({ id: 1 })
    expect(result.workspaceId).toBe('')
  })

  it('maps ownerId from owner_id', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('usr_5')
  })

  it('status is active when archived is false', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived when archived is true', () => {
    const result = transformProject({ ...raw, archived: true })
    expect(result.status).toBe('archived')
  })

  it('maps createdAt', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2026-01-10T00:00:00.000Z')
  })

  it('maps updatedAt', () => {
    const result = transformProject(raw)
    expect(result.updatedAt).toBe('2026-05-20T00:00:00.000Z')
  })

  it('platform is ora', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('ora')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

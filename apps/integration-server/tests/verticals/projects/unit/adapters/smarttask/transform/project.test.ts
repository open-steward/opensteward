import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawSmarttaskProject,
} from '../../../../../../../src/verticals/projects/adapters/smarttask/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('smarttask transformProject', () => {
  const raw: RawSmarttaskProject = {
    ProjectId: 'proj-uuid-001',
    Name: 'Mobile App Redesign',
    _archived: false,
    _organizationId: 'org-123',
  }

  it('maps id and externalId from ProjectId', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('proj-uuid-001')
    expect(result.externalId).toBe('proj-uuid-001')
  })

  it('maps name from Name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Mobile App Redesign')
  })

  it('status is active when _archived is false', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived when _archived is true', () => {
    const result = transformProject({ ...raw, _archived: true })
    expect(result.status).toBe('archived')
  })

  it('workspaceId uses _organizationId from raw object', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('org-123')
  })

  it('workspaceId falls back to organizationId param when _organizationId absent', () => {
    const result = transformProject({ ProjectId: 'p1', Name: 'X' }, 'org-param')
    expect(result.workspaceId).toBe('org-param')
  })

  it('workspaceId is empty string when neither _organizationId nor param provided', () => {
    const result = transformProject({ ProjectId: 'p1', Name: 'X' })
    expect(result.workspaceId).toBe('')
  })

  it('description is undefined', () => {
    const result = transformProject(raw)
    expect(result.description).toBeUndefined()
  })

  it('ownerId is undefined', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBeUndefined()
  })

  it('createdAt is undefined', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBeUndefined()
  })

  it('platform is smarttask', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('smarttask')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

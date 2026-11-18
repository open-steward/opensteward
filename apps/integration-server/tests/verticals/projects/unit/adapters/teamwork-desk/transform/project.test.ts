import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawSpacesSpace,
} from '../../../../../../../src/verticals/projects/adapters/teamwork-desk/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('teamwork-desk transformProject', () => {
  const raw: RawSpacesSpace = {
    id: 300,
    title: 'Engineering Docs',
    purpose: 'Central documentation for the engineering team.',
    state: 'active',
    code: 'ENG',
    spaceColor: '#3b82f6',
    icon: 'book',
    createdAt: '2024-01-10T09:00:00.000Z',
    updatedAt: '2024-02-20T15:00:00.000Z',
    createdBy: { id: 42 },
    collaboratorsCount: 8,
    projectId: 99,
  }

  it('maps id and externalId from raw.id as string', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('300')
    expect(result.externalId).toBe('300')
  })

  it('maps name from title', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Engineering Docs')
  })

  it('maps description from purpose', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Central documentation for the engineering team.')
  })

  it('status is active for active state', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived when deletedAt is present', () => {
    const result = transformProject({ ...raw, deletedAt: '2024-03-01T00:00:00.000Z' })
    expect(result.status).toBe('archived')
  })

  it('status is archived when state is archived', () => {
    const result = transformProject({ ...raw, state: 'archived' })
    expect(result.status).toBe('archived')
  })

  it('workspaceId is always empty string (installation-scoped)', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('')
  })

  it('ownerId from createdBy.id as string', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('42')
  })

  it('platform is teamwork-desk', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('teamwork-desk')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})

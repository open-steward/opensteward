import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawKanboardProject,
} from '../../../../../../../src/verticals/projects/adapters/kanboard/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('kanboard transformProject', () => {
  const raw: RawKanboardProject = {
    id: '12',
    name: 'Website Redesign',
    description: 'Redesign the company website',
    is_active: '1',
    is_private: '0',
    is_public: '0',
    owner_id: '3',
    identifier: 'WR',
    email: 'wr@example.com',
    last_modified: '1700000000',
    start_date: '2024-01-01T00:00:00.000Z',
    end_date: '2024-12-31T00:00:00.000Z',
  }

  it('maps id as string', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('12')
    expect(result.externalId).toBe('12')
  })

  it('maps name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Website Redesign')
  })

  it('maps description', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Redesign the company website')
  })

  it('status is active when is_active=1', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived when is_active=0', () => {
    const result = transformProject({ ...raw, is_active: '0' })
    expect(result.status).toBe('archived')
  })

  it('maps ownerId from owner_id', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('3')
  })

  it('workspaceId is empty string (no workspace concept)', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('')
  })

  it('platform is kanboard', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('kanboard')
  })

  it('metadata contains identifier and email', () => {
    const result = transformProject(raw)
    expect(result.metadata.identifier).toBe('WR')
    expect(result.metadata.email).toBe('wr@example.com')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it('ownerId is undefined when owner_id is absent', () => {
    const result = transformProject({ id: '1', owner_id: undefined })
    expect(result.ownerId).toBeUndefined()
  })
})
